import { Route, Routes } from 'react-router-dom';
import './family.css';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="fam-page">
      <h1>NaniTV</h1>
      <p>{title}</p>
    </div>
  );
}

export default function FamilyApp() {
  return (
    <Routes>
      <Route path="join" element={<Placeholder title="Join your family (coming in Phase 2)" />} />
      <Route path="*" element={<Placeholder title="Family app (coming soon)" />} />
    </Routes>
  );
}
