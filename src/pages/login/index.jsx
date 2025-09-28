import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/AppIcon';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e?.preventDefault();
    
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await signIn(email, password);
      navigate('/employee-pos-terminal');
    } catch (err) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    
    try {
      setLoading(true);
      setError('');
      await signIn(demoEmail, demoPassword);
      navigate('/employee-pos-terminal');
    } catch (err) {
      setError(err?.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
              <Icon name="User" size={32} className="text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
            <p className="text-gray-600">Sign in to your POS account</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded-md">
              <div className="flex">
                <Icon name="AlertCircle" size={20} className="text-red-400" />
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e?.target?.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter your email"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e?.target?.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
                loading
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500' :'bg-blue-600 hover:bg-blue-700 text-white transform hover:scale-105 shadow-lg hover:shadow-xl'
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
                  <span>Signing In...</span>
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Demo Credentials Section */}
          <div className="mt-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center">
              <Icon name="Key" size={16} className="mr-2" />
              Demo Credentials (Click to Login)
            </h3>
            <div className="space-y-3">
              <button
                onClick={() => handleDemoLogin('admin@posystem.com', 'admin123')}
                disabled={loading}
                className="w-full p-3 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">Admin Manager</div>
                    <div className="text-sm text-gray-600">admin@posystem.com</div>
                  </div>
                  <div className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">
                    Admin
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleDemoLogin('angela@posystem.com', 'angela123')}
                disabled={loading}
                className="w-full p-3 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">Angela Smith</div>
                    <div className="text-sm text-gray-600">angela@posystem.com</div>
                  </div>
                  <div className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                    Employee
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleDemoLogin('michael@posystem.com', 'michael123')}
                disabled={loading}
                className="w-full p-3 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">Michael Johnson</div>
                    <div className="text-sm text-gray-600">michael@posystem.com</div>
                  </div>
                  <div className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                    Employee
                  </div>
                </div>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Click any demo account above to automatically log in and test the system.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;