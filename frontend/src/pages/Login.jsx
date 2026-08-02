import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Validate form
      if (!formData.email || !formData.password) {
        setError('Please enter email and password');
        setLoading(false);
        return;
      }

      // Send login request to backend
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Store token and user info
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      if (formData.rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      }

      setSuccess('Login successful! Redirecting...');
      
      // Redirect to dashboard after 1 second
      setTimeout(() => {
        navigate('/dashboard');
      }, 1000);

    } catch (err) {
      console.error('Login error:', err);
      setError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen bg-surface font-body text-on-surface overflow-hidden">
      {/* Back Button */}
      <div className="absolute top-6 left-6 z-50">
        <Link
          to="/"
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all"
          title="Back to home"
        >
          <span className="material-symbols-outlined text-on-surface">arrow_back</span>
        </Link>
      </div>
      {/* Left Side: Cinematic Visual - Hidden on Mobile */}
      <section 
        className="relative hidden lg:flex lg:w-1/2 overflow-hidden items-center justify-center p-12"
        style={{
          backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuCVHRolXXHxzXGTX8-o8zTXbn-kBbokq-is6JqPEoNjT7GjnTDcIEr671Wky4ZAkneZFPgSe7JL2O2OkSsXDUsmmwgpQewP2jgxU9GeWRfTzEMWYBiaJWXaqu_WAZxEZqUuG79-nLQ0IvuN3yPigJ9z-sjzq-ChKGYIm-aNUTeIUz2et2NJ2BSMM8GY_acY3_dMmS_h2dp5RkWw43Ij4rX1_BAkbDHGDWPd_YMm1DR_uI3T1ZmrDdcGiQqhDdsCG-J8oimJNN8A6UU')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent"></div>
        
        {/* Content */}
        <div className="relative z-10 max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #004a31 0%, #2b5bb5 100%)'
            }}>
              <span className="material-symbols-outlined text-white text-2xl">agriculture</span>
            </div>
            <span className="text-white font-headline font-black text-lg tracking-tight">AgriChain Ultra</span>
          </div>
          <h1 className="font-headline font-extrabold text-white text-5xl leading-tight tracking-tighter mb-4">
            Harvesting Intelligence.
          </h1>
          <p className="text-white/80 text-sm max-w-sm leading-relaxed">
            The intersection of deep soil science and real-time artificial intelligence. Welcome back to the future of farming.
          </p>
        </div>
      </section>

      {/* Right Side: Login Form */}
      <section 
        className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-8 lg:p-12 relative overflow-y-auto"
        style={{
          backgroundColor: '#fafaf5',
          backgroundImage: `
            radial-gradient(at 0% 0%, rgba(111, 251, 190, 0.15) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgba(43, 91, 181, 0.1) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(0, 49, 31, 0.05) 0px, transparent 50%)
          `
        }}
      >
        <div className="w-full max-w-md space-y-8">
          {/* Branding for Mobile */}
          <div className="lg:hidden flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #004a31 0%, #2b5bb5 100%)'
            }}>
              <span className="material-symbols-outlined text-white text-lg">agriculture</span>
            </div>
            <span className="text-primary font-headline font-black text-lg tracking-tight">AgriChain Ultra</span>
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h2 className="font-headline font-extrabold text-primary text-3xl tracking-tight">Welcome Back</h2>
            <p className="text-on-surface-variant font-medium text-sm">Access your global precision monitoring dashboard.</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="p-3 bg-green-100 border border-green-300 rounded-lg text-green-700 text-xs font-medium">
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wide text-primary/80 ml-1 uppercase">Email Address</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-60 text-sm">alternate_email</span>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="your@email.com"
                  className="w-full pl-12 pr-4 py-3.5 bg-surface-container-highest/40 backdrop-blur-md rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 border-none transition-all placeholder:text-on-surface-variant/40 text-on-surface font-medium"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center px-1">
                <label className="text-xs font-semibold tracking-wide text-primary/80 uppercase">Password</label>
                <a className="text-xs font-semibold text-secondary hover:text-primary transition-colors" href="#">Forgot?</a>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-60 text-sm">lock</span>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••••••"
                  className="w-full pl-12 pr-4 py-3.5 bg-surface-container-highest/40 backdrop-blur-md rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 border-none transition-all placeholder:text-on-surface-variant/40 text-on-surface font-medium"
                  required
                />
              </div>
            </div>

            {/* Remember Me with Custom Checkbox */}
            <div className="flex items-center gap-2 group cursor-pointer w-fit">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  id="remember"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                  className="peer appearance-none w-5 h-5 rounded-md bg-surface-container-highest/40 border-none checked:bg-primary-container transition-all cursor-pointer"
                />
                <span className="material-symbols-outlined absolute pointer-events-none opacity-0 peer-checked:opacity-100 text-white text-sm left-1/2 -translate-x-1/2">check</span>
              </div>
              <label className="text-xs font-semibold text-on-surface-variant select-none cursor-pointer" htmlFor="remember">Stay logged in</label>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-headline font-bold py-4 rounded-full shadow-xl shadow-primary/10 hover:shadow-2xl hover:scale-[1.01] transition-all duration-300 flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #004a31 0%, #2b5bb5 100%)'
              }}
            >
              <span>{loading ? 'Signing in...' : 'Sign In'}</span>
              {!loading && <span className="material-symbols-outlined text-lg">arrow_forward</span>}
            </button>
          </form>

          {/* Sign Up Section */}
          <div className="flex flex-col items-center gap-6 pt-6">
            <h3 className="text-on-surface-variant font-medium text-center text-lg">Need an account?</h3>
            <Link
              to="/register"
              className="w-full py-4 text-white font-headline font-bold rounded-full shadow-xl shadow-primary/10 hover:shadow-2xl hover:scale-[1.01] transition-all duration-300 flex items-center justify-center text-sm"
              style={{
                background: 'linear-gradient(135deg, #004a31 0%, #2b5bb5 100%)'
              }}
            >
              Sign up
            </Link>

            {/* AI Active Badge */}
            <div className="flex items-center gap-2 px-4 py-2 bg-primary-fixed-dim/30 rounded-full border border-primary-fixed-dim/50">
              <span className="flex h-2.5 w-2.5 rounded-full bg-primary-fixed"></span>
              <span className="text-xs font-bold text-primary uppercase tracking-wider">AI Active</span>
            </div>
          </div>

          {/* Footer */}
          <footer className="pt-6 text-center">
            <p className="text-[8px] uppercase tracking-[0.15em] font-bold text-outline/60 leading-tight">
              © 2024 AgriChain Ultra. Precision for Modern Harvest.
            </p>
          </footer>
        </div>
      </section>
    </main>
  );
};

export default Login;
