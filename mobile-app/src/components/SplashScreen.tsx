import { useEffect, useState } from 'react';
import logo from '@/assets/jalrakshak-logo.jpg';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen = ({ onFinish }: SplashScreenProps) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onFinish, 500); // Wait for fade out animation
    }, 2500);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#0f82a8] to-[#1ea8d6] transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="animate-scale-in">
        <img
          src={logo}
          alt="JalRakshak Logo"
          className="w-64 h-64 object-cover rounded-full animate-pulse"
          style={{
            boxShadow: '0 0 40px rgba(255, 255, 255, 0.6), 0 0 80px rgba(255, 255, 255, 0.4), 0 0 120px rgba(30, 168, 214, 0.5)',
          }}
        />
      </div>
    </div>
  );
};
