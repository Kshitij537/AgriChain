import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
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
      if (!formData.fullName || !formData.email || !formData.phoneNumber || !formData.password) {
        setError('All fields are required');
        setLoading(false);
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }

      if (!formData.agreeTerms) {
        setError('You must agree to Terms & Conditions');
        setLoading(false);
        return;
      }

      // Send registration request to backend
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          phoneNumber: formData.phoneNumber,
          password: formData.password,
          confirmPassword: formData.confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
        setLoading(false);
        return;
      }

      // Store token and user info
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      setSuccess('Account created successfully! Redirecting...');
      
      // Redirect to dashboard after 1.5 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);

    } catch (err) {
      console.error('Registration error:', err);
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
            Join the Revolution.
          </h1>
          <p className="text-white/80 text-sm max-w-sm leading-relaxed">
            Start your journey with precision farming tools powered by artificial intelligence and deep soil science.
          </p>
        </div>
      </section>

      {/* Right Side: Register Form */}
      <section 
        className="w-full lg:w-1/2 flex items-center justify-center p-3 md:p-4 lg:p-5 relative overflow-y-auto"
        style={{
          backgroundColor: '#fafaf5',
          backgroundImage: `
            radial-gradient(at 0% 0%, rgba(111, 251, 190, 0.15) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgba(43, 91, 181, 0.1) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(0, 49, 31, 0.05) 0px, transparent 50%)
          `
        }}
      >
        <div className="w-full max-w-md space-y-2">
          {/* Branding for Mobile */}
          <div className="lg:hidden flex items-center gap-3 mb-0.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #004a31 0%, #2b5bb5 100%)'
            }}>
              <span className="material-symbols-outlined text-white text-lg">agriculture</span>
            </div>
            <span className="text-primary font-headline font-black text-lg tracking-tight">AgriChain Ultra</span>
          </div>

          {/* Heading */}
          <div className="space-y-0.5">
            <h2 className="font-headline font-extrabold text-primary text-2xl tracking-tight">Create Account</h2>
            <p className="text-on-surface-variant font-medium text-[11px]">Join us today.</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-2 bg-red-100 border border-red-300 rounded-lg text-red-700 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="p-2 bg-green-100 border border-green-300 rounded-lg text-green-700 text-xs font-medium">
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Full Name Field */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold tracking-wide text-primary/80 ml-1 uppercase">Full Name</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-60 text-sm">person</span>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  placeholder="John Agronomist"
                  className="w-full pl-12 pr-4 py-3 bg-surface-container-highest/40 backdrop-blur-md rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 border-none transition-all placeholder:text-on-surface-variant/40 text-on-surface font-medium"
                  required
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold tracking-wide text-primary/80 ml-1 uppercase">Email</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-60 text-sm">alternate_email</span>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@agrichain.com"
                  className="w-full pl-12 pr-4 py-3 bg-surface-container-highest/40 backdrop-blur-md rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 border-none transition-all placeholder:text-on-surface-variant/40 text-on-surface font-medium"
                  required
                />
              </div>
            </div>

            {/* Phone Number Field */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold tracking-wide text-primary/80 ml-1 uppercase">Phone Number</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-60 text-sm">phone</span>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  placeholder="+1 (555) 000-0000"
                  className="w-full pl-12 pr-4 py-3 bg-surface-container-highest/40 backdrop-blur-md rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 border-none transition-all placeholder:text-on-surface-variant/40 text-on-surface font-medium"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold tracking-wide text-primary/80 ml-1 uppercase">Password</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-60 text-sm">lock</span>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••••••"
                  className="w-full pl-12 pr-4 py-3 bg-surface-container-highest/40 backdrop-blur-md rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 border-none transition-all placeholder:text-on-surface-variant/40 text-on-surface font-medium"
                  required
                />
              </div>
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold tracking-wide text-primary/80 ml-1 uppercase">Confirm Password</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-60 text-sm">lock_check</span>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="••••••••••••"
                  className="w-full pl-12 pr-4 py-3 bg-surface-container-highest/40 backdrop-blur-md rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20 border-none transition-all placeholder:text-on-surface-variant/40 text-on-surface font-medium"
                  required
                />
              </div>
            </div>

            {/* Terms Agreement Checkbox */}
            <div className="flex items-center gap-2 group cursor-pointer w-fit pt-1">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  id="agree"
                  name="agreeTerms"
                  checked={formData.agreeTerms}
                  onChange={handleChange}
                  className="peer appearance-none w-5 h-5 rounded-md bg-surface-container-highest/40 border-none checked:bg-primary-container transition-all cursor-pointer"
                />
                <span className="material-symbols-outlined absolute pointer-events-none opacity-0 peer-checked:opacity-100 text-white text-sm left-1/2 -translate-x-1/2">check</span>
              </div>
              <label className="text-[10px] font-semibold text-on-surface-variant select-none cursor-pointer" htmlFor="agree">I agree to Terms & Conditions</label>
            </div>

            {/* Sign Up Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-headline font-bold py-3 rounded-full shadow-xl shadow-primary/10 hover:shadow-2xl hover:scale-[1.01] transition-all duration-300 flex items-center justify-center gap-2 text-sm mt-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #004a31 0%, #2b5bb5 100%)'
              }}
            >
              <span>{loading ? 'Creating Account...' : 'Sign Up'}</span>
              {!loading && <span className="material-symbols-outlined text-lg">arrow_forward</span>}
            </button>
          </form>

          {/* Login Link Section */}
          <div className="flex flex-col items-center gap-1.5 pt-0.5">
            <h3 className="text-on-surface-variant font-medium text-center text-[10px]">Already have an account?</h3>
            <Link
              to="/login"
              className="w-full py-3 text-white font-headline font-bold rounded-full shadow-xl shadow-primary/10 hover:shadow-2xl hover:scale-[1.01] transition-all duration-300 flex items-center justify-center text-sm"
              style={{
                background: 'linear-gradient(135deg, #004a31 0%, #2b5bb5 100%)'
              }}
            >
              Sign In
            </Link>

            {/* AI Active Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-fixed-dim/30 rounded-full border border-primary-fixed-dim/50">
              <span className="flex h-2 w-2 rounded-full bg-primary-fixed"></span>
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">AI Active</span>
            </div>
          </div>

          {/* Footer */}
          <footer className="pt-1 text-center">
            <p className="text-[7px] uppercase tracking-[0.1em] font-bold text-outline/60 leading-tight">
              © 2024 AgriChain Ultra
            </p>
          </footer>
        </div>
      </section>
    </main>
  );
};

export default Register;
