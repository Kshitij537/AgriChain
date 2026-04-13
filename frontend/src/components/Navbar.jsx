import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-10 py-4 rounded-full mt-6 mx-auto w-[92%] max-w-7xl bg-emerald-950/40 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] border border-white/10">
      <Link to="/" className="text-xl font-black tracking-tighter text-white font-headline">
        AgriChain 
      </Link>

      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center gap-8">
        <a href="#solutions" className="font-headline text-sm font-semibold tracking-tight uppercase text-emerald-400 border-b-2 border-emerald-400 pb-1 transition-colors">
          Solutions
        </a>
        <a href="#platform" className="font-headline text-sm font-semibold tracking-tight uppercase text-white/70 hover:text-white transition-colors">
          Platform
        </a>
        <a href="#insights" className="font-headline text-sm font-semibold tracking-tight uppercase text-white/70 hover:text-white transition-colors">
          Insights
        </a>
      </nav>

      {/* Mobile Menu Button */}
      <button
        className="md:hidden flex flex-col gap-1"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="w-6 h-0.5 bg-white transition-all"></span>
        <span className="w-6 h-0.5 bg-white transition-all"></span>
        <span className="w-6 h-0.5 bg-white transition-all"></span>
      </button>

      {/* Get Started Button */}
      <Link to="/login" className="hidden md:block bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-full font-headline text-sm font-semibold tracking-tight uppercase transition-all duration-500 hover:scale-105 active:scale-90 text-white border border-white/10">
        Get Started
      </Link>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden absolute top-20 left-4 right-4 bg-emerald-950/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          <div className="space-y-4">
            <a href="#solutions" className="block text-white font-semibold py-2 hover:text-emerald-400 transition-colors">
              Solutions
            </a>
            <a href="#platform" className="block text-white/70 font-semibold py-2 hover:text-white transition-colors">
              Platform
            </a>
            <a href="#insights" className="block text-white/70 font-semibold py-2 hover:text-white transition-colors">
              Insights
            </a>
            <Link to="/login" className="w-full bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-full text-white font-semibold mt-4 border border-white/10 transition-all block text-center">
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
