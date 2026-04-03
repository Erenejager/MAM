import { useState, useEffect, useCallback } from 'react';
import { checkAuth, login as apiLogin, logout as apiLogout } from '../lib/api';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth()
      .then(setIsAuthenticated)
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (password: string): Promise<boolean> => {
    const ok = await apiLogin(password);
    setIsAuthenticated(ok);
    return ok;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, isLoading, login, logout };
}
