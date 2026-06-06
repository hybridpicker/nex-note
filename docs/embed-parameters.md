# Embed Parameters

nex-note supports score-only embeds and compact full-app embeds for iframe hosts such as Jarvis Guitar Mentor.

Score-only embeds keep the existing behavior:

```html
<iframe src="/nex-note-app/?embed=1&chrome=0&entry=score-123&scoreDataUrl=/api/scores/{entry}/nex-note-data"></iframe>
```

`chrome=0` hides the app chrome and renders only the score.

Compact full-app embeds should keep chrome enabled and collapse the side workspaces on initial load:

```html
<iframe src="/nex-note-app/?embed=1&entry=score-123&leftTools=collapsed&assistant=collapsed&scoreDataUrl=/api/scores/{entry}/nex-note-data"></iframe>
```

`leftTools=collapsed` starts the notation tools as the left rail. `assistant=collapsed` and `workspace=collapsed` both start the AI/workspace panel as the right rail.

These parameters only set initial state. Users can expand or collapse both panels normally after startup. Existing left notation sidebar `localStorage` state is used when no explicit embed panel parameter is present.
