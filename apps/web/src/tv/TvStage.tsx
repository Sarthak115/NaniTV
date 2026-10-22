import { ReactNode, useEffect, useState } from 'react';
import './tv.css';

/** Renders children on a fixed 1920x1080 canvas scaled to fit the viewport. */
export default function TvStage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="tv-root">
      <div className="tv-stage" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
