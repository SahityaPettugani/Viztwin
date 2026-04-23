
  # Design Home Page Layout

  ## Running the code

  1. Install dependencies with `npm i`.
  2. Copy `.env.example` to `.env` and set your Supabase URL and anon key.
  3. In Supabase SQL Editor, run [`supabase/migrations/20260317_create_projects.sql`](./supabase/migrations/20260317_create_projects.sql).
  4. Start the local processing server and Vite together with `npm run dev-all`.

  Run `npm run server` to start the development server.
  Run `npm run dev` to start the app.

  ## What Changed

  The app now uses:

  - Supabase Auth for email/password login
  - Supabase Storage for uploaded source files and generated outputs
  - A `projects` table to reload prior uploads per user

  The local Node server is still responsible for point-cloud processing. After processing completes, the frontend uploads the resulting files to Supabase so they remain available after refresh or sign-in on another machine.

  ## Current Processing Notes

  The current live processing path uses:

  - `BACKEND/scantobim/viz_2.py` for segmentation and instantiation
  - `BACKEND/cloud2bim/json2ifc.py` for IFC conversion
  - `server.js` as the upload and orchestration layer

  Current behavior:

  - Uploads are capped at `2 GB`
  - The backend accepts `.ply` and `.pcd` inputs, but the UI currently only allows `.ply`
  - `all_instances_combined.ply` now uses globally unique colors per instance, so `wall_instance_000` and `door_instance_000` will not reuse the same color
