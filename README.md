
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
