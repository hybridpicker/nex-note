import packageJson from '@/package.json';

import { IPAD_SERVER_ID } from '@/scripts/ipad-dev-helpers.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: IPAD_SERVER_ID,
      version: packageJson.version,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
