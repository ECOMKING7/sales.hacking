import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { readClaim } from '../utils/amoClaim';

/**
 * amoMarket'dan o'rnatib, keyin kirgan/ro'yxatdan o'tgan foydalanuvchini
 * /amocrm/install ga qaytaradi. Biriktirish O'SHA sahifada, foydalanuvchi
 * "Ulash" tugmasini bosgandagina bo'ladi — bu yerda hech narsa
 * avtomatik yuborilmaydi (umumiy kompyuterda boshqa odamning kaliti
 * keyingi foydalanuvchiga jimgina ulanib ketmasin).
 */
export default function PendingAmoClaim() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (pathname.startsWith('/amocrm/install')) return;
    if (readClaim()) navigate('/amocrm/install', { replace: true });
  }, [isAuthenticated, pathname, navigate]);

  return null;
}
