import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './lib/api';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Verify from './pages/Verify';
import ListingDetail from './pages/ListingDetail';
import CreateListing from './pages/CreateListing';
import BuyerDashboard from './pages/BuyerDashboard';
import SellerDashboard from './pages/SellerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import StripeReturn from './pages/StripeReturn';

type User = { id: string; email: string; role: string; status: string } | null;
type AuthCtx = { user: User; setUser: (u: User) => void; loading: boolean };

export const AuthContext = createContext<AuthCtx>({ user: null, setUser: () => {}, loading: true });
export const useAuth = () => useContext(AuthContext);

function Nav() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const logout = async () => {
    await api.logout();
    setUser(null);
    navigate('/login');
  };

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <Link to="/" className="text-xl font-bold text-brand-700">Bridge</Link>
      <div className="flex items-center gap-4 text-sm">
        {user ? (
          <>
            {(user.role === 'seller' || user.role === 'both') && user.status === 'approved' && (
              <>
                <Link to="/selling" className="text-gray-600 hover:text-brand-700">My Listings</Link>
                <Link to="/listings/create" className="text-gray-600 hover:text-brand-700">+ List Item</Link>
              </>
            )}
            <Link to="/orders" className="text-gray-600 hover:text-brand-700">Orders</Link>
            {/* Admin link — in production this should be role-gated server-side too */}
            <Link to="/admin" className="text-gray-500 hover:text-brand-700 text-xs">Admin</Link>
            <button onClick={logout} className="text-gray-500 hover:text-red-600">Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" className="text-gray-600 hover:text-brand-700">Login</Link>
            <Link to="/register" className="bg-brand-600 text-white px-3 py-1.5 rounded hover:bg-brand-700">
              Sign up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me()
      .then(({ user: u }) => setUser(u as User))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading }}>
      <BrowserRouter>
        <Nav />
        <main className="max-w-6xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/listings/create" element={<CreateListing />} />
            <Route path="/listings/:id" element={<ListingDetail />} />
            <Route path="/orders" element={<BuyerDashboard />} />
            <Route path="/selling" element={<SellerDashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/stripe/connect/return" element={<StripeReturn />} />
            <Route path="/stripe/connect/refresh" element={<StripeReturn refresh />} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
