import type { RouteObject } from 'react-router';
import { Home } from './Home.tsx';

export const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/patient/*', lazy: async () => ({ Component: (await import('./patient/routes.tsx')).PatientRoutes }) },
  { path: '/clinician/*', lazy: async () => ({ Component: (await import('./clinician/routes.tsx')).ClinicianRoutes }) },
  { path: '/admin/*', lazy: async () => ({ Component: (await import('./admin/routes.tsx')).AdminRoutes }) },
  { path: '/ui', lazy: async () => ({ Component: (await import('./ui/Showcase.tsx')).Showcase }) },
];
