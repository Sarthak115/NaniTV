import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import TvApp from './tv/TvApp';
import FamilyApp from './family/FamilyApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/tv/*" element={<TvApp />} />
        <Route path="/family/*" element={<FamilyApp />} />
        <Route path="*" element={<Navigate to="/family" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
