import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router';
import { HomeRoutes } from './home/HomeRoutes.tsx';

const PoseLab = lazy(async () => ({ default: (await import('./lab/PoseLab.tsx')).PoseLab }));
const SessionRunner = lazy(async () => ({ default: (await import('./session/SessionRunner.tsx')).SessionRunner }));

export function PatientRoutes() {
  return (
    <Routes>
      <Route
        index
        element={
          <main className="p-6">
            <h1 className="text-3xl font-bold">Patient</h1>
            <Link className="mt-4 block text-[20pt] underline" to="session">
              Start a session
            </Link>
            <Link className="mt-4 block text-[20pt] underline" to="home">
              Home mode
            </Link>
            <Link className="mt-4 block text-[20pt] underline" to="lab/pose">
              Pose lab
            </Link>
          </main>
        }
      />
      <Route
        path="session"
        element={
          <Suspense>
            <SessionRunner />
          </Suspense>
        }
      />
      <Route path="home/*" element={<HomeRoutes />} />
      <Route
        path="lab/pose"
        element={
          <Suspense>
            <PoseLab />
          </Suspense>
        }
      />
    </Routes>
  );
}
