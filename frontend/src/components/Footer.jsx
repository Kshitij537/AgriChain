import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="w-full flex flex-col md:flex-row justify-between items-center px-10 py-8 border-t border-white/5 bg-neutral-950">
      {/* Brand and Copyright */}
      <div className="mb-6 md:mb-0">
        <span className="font-headline font-black text-emerald-400 tracking-tighter text-xl">
          AgriChain 
        </span>
        <p className="font-headline text-xs uppercase tracking-[0.2em] font-medium text-white/40 mt-1">
          © 2024 AgriChain . Harvesting Intelligence.
        </p>
      </div>

      {/* Links */}
      <div className="flex gap-8">
        <a 
          href="#privacy" 
          className="font-headline text-xs uppercase tracking-[0.2em] font-medium text-white/40 hover:text-emerald-400 transition-all duration-300"
        >
          Privacy Policy
        </a>
        <a 
          href="#terms" 
          className="font-headline text-xs uppercase tracking-[0.2em] font-medium text-white/40 hover:text-emerald-400 transition-all duration-300"
        >
          Terms of Service
        </a>
        <a 
          href="#contact" 
          className="font-headline text-xs uppercase tracking-[0.2em] font-medium text-white/40 hover:text-emerald-400 transition-all duration-300"
        >
          Contact
        </a>
      </div>
    </footer>
  );
};

export default Footer;
