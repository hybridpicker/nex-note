import Capacitor
import CoreMIDI
import Darwin

@objc(NexNoteBridgeViewController)
class NexNoteBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeMidiPlugin())
    }
}

/// Transports MIDI 1 channel messages only. Musical interpretation lives in TypeScript.
@objc(NativeMidiPlugin)
public class NativeMidiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeMidiPlugin"
    public let jsName = "NexNoteMidi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "select", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]
    private var client = MIDIClientRef()
    private var port = MIDIPortRef()
    private var endpoint = MIDIEndpointRef()
    private var sourceSnapshot: [MIDIEndpointRef] = []
    private var generation = 0
    private var runningStatus: UInt8 = 0
    private var message: [UInt8] = []
    private var sysex = false

    private func sourceID(_ source: MIDIEndpointRef) -> String {
        var uniqueID: Int32 = 0
        MIDIObjectGetIntegerProperty(source, kMIDIPropertyUniqueID, &uniqueID)
        return String(uniqueID)
    }
    private func devices() -> [[String: String]] {
        (0..<MIDIGetNumberOfSources()).map { index in
            let source = MIDIGetSource(index)
            var name: Unmanaged<CFString>?
            MIDIObjectGetStringProperty(source, kMIDIPropertyDisplayName, &name)
            return ["id": sourceID(source), "name": name?.takeRetainedValue() as String? ?? "MIDI input"]
        }
    }
    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.client == 0 {
                let status = MIDIClientCreateWithBlock("Nex Note input" as CFString, &self.client) { [weak self] _ in
                    DispatchQueue.main.async {
                        guard let self = self, self.client != 0 else { return }
                        let sources = (0..<MIDIGetNumberOfSources()).map { MIDIGetSource($0) }
                        guard sources != self.sourceSnapshot else { return }
                        self.sourceSnapshot = sources
                        self.notifyListeners("devices", data: ["devices": self.devices()])
                    }
                }
                guard status == noErr else { call.reject("Could not start CoreMIDI"); return }
            }
            self.sourceSnapshot = (0..<MIDIGetNumberOfSources()).map { MIDIGetSource($0) }
            call.resolve(["devices": self.devices()])
        }
    }
    private func disconnect() {
        generation += 1
        if port != 0 {
            if endpoint != 0 { MIDIPortDisconnectSource(port, endpoint) }
            MIDIPortDispose(port)
        }
        port = 0; endpoint = 0; runningStatus = 0; message = []; sysex = false
    }
    @objc func select(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.client != 0, let id = call.getString("id"),
                  let source = (0..<MIDIGetNumberOfSources()).map({ MIDIGetSource($0) }).first(where: { self.sourceID($0) == id })
            else { call.reject("MIDI source is disconnected"); return }
            self.disconnect()
            let generation = self.generation
            let status = MIDIInputPortCreateWithBlock(self.client, "Selected input" as CFString, &self.port) { [weak self] packets, _ in
                // Copy only packet bytes while the callback-owned pointer is valid.
                var copied: [(MIDITimeStamp, [UInt8])] = []
                var packet = UnsafeRawPointer(packets).advanced(by: MemoryLayout<MIDIPacketList>.offset(of: \.packet)!).assumingMemoryBound(to: MIDIPacket.self)
                for _ in 0..<packets.pointee.numPackets {
                    let data = UnsafeRawPointer(packet).advanced(by: MemoryLayout<MIDIPacket>.offset(of: \.data)!).assumingMemoryBound(to: UInt8.self)
                    let bytes = Array(UnsafeBufferPointer(start: data, count: Int(packet.pointee.length)))
                    copied.append((packet.pointee.timeStamp, bytes))
                    packet = UnsafePointer(MIDIPacketNext(packet))
                }
                DispatchQueue.main.async {
                    guard let self = self, self.generation == generation else { return }
                    for (timestamp, bytes) in copied { self.receive(bytes, id: id, timestamp: timestamp) }
                }
            }
            guard status == noErr, MIDIPortConnectSource(self.port, source, nil) == noErr else {
                self.disconnect(); call.reject("Could not connect MIDI source"); return
            }
            self.endpoint = source
            call.resolve()
        }
    }
    private func receive(_ bytes: [UInt8], id: String, timestamp: MIDITimeStamp) {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        let now = mach_absolute_time()
        let ageMs = timestamp > 0 && timestamp <= now ? Double(now - timestamp) * Double(info.numer) / Double(info.denom) / 1_000_000 : 0
        for byte in bytes {
            if byte >= 0xF8 { continue }
            if byte == 0xF0 { sysex = true; runningStatus = 0; message = []; continue }
            if byte == 0xF7 { sysex = false; continue }
            if sysex { continue }
            if byte >= 0x80 {
                runningStatus = byte < 0xF0 ? byte : 0
                message = []
                continue
            }
            guard runningStatus != 0 else { continue }
            message.append(byte)
            let kind = runningStatus & 0xF0
            let length = kind == 0xC0 || kind == 0xD0 ? 1 : 2
            if message.count == length {
                if kind == 0x80 || kind == 0x90 || kind == 0xB0 {
                    notifyListeners("message", data: ["id": id, "data": [Int(runningStatus)] + message.map(Int.init), "ageMs": ageMs])
                }
                message = []
            }
        }
    }
    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.disconnect()
            if self.client != 0 { MIDIClientDispose(self.client); self.client = 0 }
            call.resolve()
        }
    }
    deinit {
        if port != 0 { MIDIPortDispose(port) }
        if client != 0 { MIDIClientDispose(client) }
    }
}
