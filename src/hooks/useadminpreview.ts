/**
 * useAdminPreview.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook centralizado que escucha mensajes postMessage del panel de administración
 * (AdminConfig.tsx) y actualiza el estado local de configuración en tiempo real,
 * sin necesidad de recargar la página ni esperar a Supabase.
 *
 * USO:
 *   const [config, setConfig] = useState<Record<string, string>>({});
 *   useAdminPreview(setConfig);
 *
 * MENSAJES SOPORTADOS:
 *   - ADMIN_PREVIEW_UPDATE  → merge del payload en el config local
 *   - ADMIN_PREVIEW_RELOAD_PRODUCTS → señal para refrescar productos (opcional)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect } from 'react';

type ConfigSetter = React.Dispatch<React.SetStateAction<Record<string, string>>>;

export function useAdminPreview(setConfig: ConfigSetter): void {
    useEffect(() => {
        const handler = (e: MessageEvent) => {
            // Seguridad: sólo aceptar mensajes del mismo origen
            if (e.origin !== window.location.origin) return;

            if (e.data?.type === 'ADMIN_PREVIEW_UPDATE') {
                const payload = e.data.payload as Record<string, string>;
                if (payload && typeof payload === 'object') {
                    setConfig(prev => ({ ...prev, ...payload }));
                }
            }
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [setConfig]);
}