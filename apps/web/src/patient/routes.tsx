import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router';

const PoseLab = lazy(async () => ({ default: (await import('./lab/PoseLab.tsx')).PoseLab }));

export function PatientRoutes() {
  return (
    <Routes>
      <Route
        index
        element={
          <main className="p-6">
            <h1 className="text-3xl font-bold">Patient</h1>
            <Link className="mt-4 block text-[20pt] underline" to="lab/pose">
              Pose lab
            </Link>
          </main>
        }
      />
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
