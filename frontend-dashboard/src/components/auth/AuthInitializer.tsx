import { useEffect } from 'react';
import { getMe } from '@/lib/api/auth';
import { getStoredToken, useAuthStore } from '@/stores/authStore';

/**
 * Validates persisted JWT on app startup.
 * - If token is valid: refreshes current user profile.
 * - If token is invalid/expired: logs out.
 */
export function AuthInitializer() {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    let cancelled = false;

    async function validateTokenOnStartup() {
      const token = getStoredToken();

      if (!token) {
        if (!cancelled) {
          logout();
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
      }

      try {
        const user = await getMe();
        if (!cancelled) {
          setUser(user);
        }
      } catch {
        if (!cancelled) {
          logout();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void validateTokenOnStartup();

    return () => {
      cancelled = true;
    };
  }, [logout, setLoading, setUser]);

  return null;
}
