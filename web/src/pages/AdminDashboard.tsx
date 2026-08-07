import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../App';

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [pendingUsers, setPendingUsers] = useState<Record<string, unknown>[]>([]);
  const [pendingImages, setPendingImages] = useState<Record<string, unknown>[]>([]);
  const [inviteCodes, setInviteCodes] = useState<Record<string, unknown>[]>([]);
  const [tab, setTab] = useState<'users' | 'images' | 'codes'>('users');
  const [fetching, setFetching] = useState(true);
  const [suspendId, setSuspendId] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user || user.status !== 'approved') { navigate('/'); return; }
    refresh();
  }, [user, loading]);

  const refresh = async () => {
    setFetching(true);
    try {
      const [u, i, c] = await Promise.all([
        api.getPendingUsers(),
        api.getPendingImages(),
        api.getInviteCodes(),
      ]);
      setPendingUsers(u.users);
      setPendingImages(i.images);
      setInviteCodes(c.codes);
    } catch (e) {
      setMsg('Failed to load admin data');
    }
    setFetching(false);
  };

  const approve = async (id: string) => {
    const d = await api.approveUser(id).catch(e => ({ message: e.message }));
    setMsg(d.message);
    refresh();
  };

  const reject = async (id: string) => {
    const d = await api.rejectUser(id, 'Application rejected').catch(e => ({ message: e.message }));
    setMsg(d.message);
    refresh();
  };

  const suspend = async (id: string) => {
    if (!suspendReason) return;
    const d = await api.suspendUser(id, suspendReason).catch(e => ({ message: e.message }));
    setMsg(d.message);
    setSuspendId('');
    setSuspendReason('');
    refresh();
  };

  const approveImage = async (id: string) => {
    await api.approveImage(id).catch(() => {});
    refresh();
  };

  const flagImage = async (id: string) => {
    await api.flagImage(id, 'Admin flagged').catch(() => {});
    refresh();
  };

  const generateCode = async () => {
    const d = await api.createInviteCode();
    setMsg(`New invite code: ${d.code}`);
    refresh();
  };

  if (fetching) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin</h1>
      {msg && <p className="bg-brand-50 border border-brand-200 text-brand-800 rounded p-3 text-sm mb-4">{msg}</p>}

      <div className="flex gap-4 border-b mb-4">
        {([
          ['users', `Users (${pendingUsers.length})`],
          ['images', `Images (${pendingImages.length})`],
          ['codes', 'Invite codes'],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div>
          {pendingUsers.length === 0 ? (
            <p className="text-gray-500">No pending applications.</p>
          ) : pendingUsers.map(u => (
            <div key={u.id as string} className="border rounded-lg p-4 mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{u.email as string}</p>
                  <p className="text-sm text-gray-500">Role: {u.role as string} · Phone: {u.phone as string}</p>
                  <p className="text-xs text-gray-400 mt-1">Applied {new Date((u.created_at as number) * 1000).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approve(u.id as string)}
                    className="text-sm bg-brand-600 text-white px-3 py-1.5 rounded hover:bg-brand-700">
                    Approve
                  </button>
                  <button onClick={() => reject(u.id as string)}
                    className="text-sm border border-red-200 text-red-600 px-3 py-1.5 rounded hover:bg-red-50">
                    Reject
                  </button>
                  <button onClick={() => setSuspendId(suspendId === (u.id as string) ? '' : u.id as string)}
                    className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-50">
                    Suspend
                  </button>
                </div>
              </div>
              {suspendId === (u.id as string) && (
                <div className="mt-3 flex gap-2">
                  <input value={suspendReason} onChange={e => setSuspendReason(e.target.value)}
                    className="flex-1 border rounded px-3 py-1.5 text-sm" placeholder="Suspension reason…" />
                  <button onClick={() => suspend(u.id as string)}
                    className="bg-red-600 text-white px-3 py-1.5 rounded text-sm hover:bg-red-700">
                    Confirm suspend
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'images' && (
        <div>
          {pendingImages.length === 0 ? (
            <p className="text-gray-500">No images pending review.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {pendingImages.map(img => (
                <div key={img.id as string} className="border rounded-lg overflow-hidden">
                  <img
                    src={`/api/listings/images/${img.r2_key as string}`}
                    alt=""
                    className="w-full h-40 object-cover"
                  />
                  <div className="p-2">
                    <p className="text-xs text-gray-500 mb-2">{img.listing_title as string}</p>
                    <div className="flex gap-2">
                      <button onClick={() => approveImage(img.id as string)}
                        className="flex-1 text-xs bg-brand-600 text-white py-1 rounded hover:bg-brand-700">
                        Approve
                      </button>
                      <button onClick={() => flagImage(img.id as string)}
                        className="flex-1 text-xs border border-red-200 text-red-600 py-1 rounded hover:bg-red-50">
                        Flag
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'codes' && (
        <div>
          <button onClick={generateCode}
            className="bg-brand-600 text-white px-4 py-2 rounded text-sm hover:bg-brand-700 mb-4">
            Generate invite code
          </button>
          <div className="space-y-2">
            {inviteCodes.map(c => (
              <div key={c.id as string} className="flex items-center gap-4 border rounded p-3 text-sm">
                <code className="font-mono font-bold tracking-wider">{c.code as string}</code>
                {c.used_by_email
                  ? <span className="text-gray-400">Used by {c.used_by_email as string}</span>
                  : <span className="text-brand-600">Available</span>}
                <span className="text-gray-400 ml-auto">
                  {new Date((c.created_at as number) * 1000).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
