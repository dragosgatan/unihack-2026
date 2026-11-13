import { Route, Routes } from 'react-router';

export function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<h1 className="p-6 text-3xl font-bold">Admin</h1>} />
    </Routes>
  );
}
