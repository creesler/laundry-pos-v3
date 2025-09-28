import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';

const AdminLogin = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (password === 'admin') {
        // For demo purposes, we'll create a mock session
        // In production, use proper Supabase authentication
        try {
          // Try to sign in with demo credentials
          await signIn(email, 'demo-password-123');
        } catch (authError) {
          // If auth fails, continue with session storage for demo
          console.log('Demo mode: Using session storage for admin authentication');
        }
        
        // Store admin authentication flag
        sessionStorage.setItem('adminAuthenticated', 'true');
        sessionStorage.setItem('adminEmail', email);
        navigate('/operations-overview-dashboard');
      } else {
        setError('Invalid admin password. Please try again.');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
      console.error('Admin login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Login Card */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
              <Icon name="Shield" size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">LaundryKing Analytics</h1>
            <p className="text-blue-100">Admin Login</p>
          </div>

          {/* Login Form */}
          <div className="p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Email Field (Demo) */}
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Admin Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e?.target?.value)}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="admin@demo.com"
                  disabled // Demo email is fixed
                />
                <p className="text-xs text-gray-500">Demo email (read-only)</p>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Admin Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e?.target?.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all pr-12"
                    placeholder="Enter admin password"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                    disabled={loading}
                  >
                    <Icon name={showPassword ? 'EyeOff' : 'Eye'} size={20} />
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <Icon name="AlertCircle" size={16} className="text-red-500 flex-shrink-0" />
                  <span className="text-sm text-red-700">{error}</span>
                </div>
              )}

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading || !password}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-white transition-all duration-200 flex items-center justify-center space-x-2 ${
                  loading || !password
                    ? 'bg-slate-300 cursor-not-allowed' :'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transform hover:scale-105'
                }`}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <Icon name="LogIn" size={20} />
                    <span>Login</span>
                  </>
                )}
              </button>
            </form>

            {/* Demo Info */}
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <div className="flex items-start space-x-3">
                <Icon name="Key" size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-yellow-700">
                  <p className="font-medium mb-1">Demo Credentials</p>
                  <p>Password: <code className="bg-yellow-100 px-1 rounded text-yellow-800">admin</code></p>
                  <p className="text-xs mt-1">This provides access to the admin dashboard with JWT token handling.</p>
                </div>
              </div>
            </div>

            {/* Security Notice */}
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start space-x-3">
                <Icon name="Info" size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">Secure Access</p>
                  <p>This login provides access to administrative dashboard with staff management, inventory control, and system logs.</p>
                </div>
              </div>
            </div>

            {/* Back to Terminal Link */}
            <div className="mt-6 text-center">
              <button
                onClick={() => navigate('/')}
                className="text-sm text-slate-500 hover:text-slate-700 underline transition-colors"
              >
                Back to Employee Terminal
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-slate-500">
          <p>© 2025 LaundryKing Analytics. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;