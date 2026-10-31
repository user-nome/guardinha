import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { MessagesProvider, useMessages } from '@zero/renderer/i18n';
import { Sidebar } from '@zero/renderer/components/Sidebar';
import { Home } from '@zero/renderer/components/Home';
import { Generator } from '@zero/renderer/components/Generator';
import { Authenticator } from '@zero/renderer/components/Authenticator';
import { Backup } from '@zero/renderer/components/Backup';
import { Credits } from '@zero/renderer/components/Credits';
import { Settings } from '@zero/renderer/components/Settings';
import { AuthModal } from '@zero/renderer/components/AuthModal';
import { DestroyModal } from '@zero/renderer/components/DestroyModal';
import { MigrationModal } from '@zero/renderer/components/MigrationModal';
import { Toast } from '@zero/renderer/components/Toast';
import { STATUS_POLL_MS } from '@zero/shared/auth-constants';
import type { Language, TabType, VaultMigrationStatus, VaultStatus } from '@zero/types';

interface ShellProps {
  status: VaultStatus | null;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onRefresh: () => Promise<void>;
}

function Shell({ status, language, onLanguageChange, onRefresh }: ShellProps): JSX.Element {
  const m = useMessages();
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDestroy, setConfirmDestroy] = useState(false);
  const [migration, setMigration] = useState<VaultMigrationStatus | null>(null);
  const [showMigration, setShowMigration] = useState(false);

  const closeToast = useCallback((): void => setToast(null), []);
  const askDestroy = useCallback((): void => setConfirmDestroy(true), []);
  const cancelDestroy = useCallback((): void => setConfirmDestroy(false), []);

  const unlocked = status !== null && status.exists && !status.locked;

  const refreshMigration = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.vault.migrationStatus();
      setMigration(next);
      setShowMigration(next.needed);
    } catch (error) {
      console.error('Falha ao consultar a migração do cofre:', error);
    }
  }, []);

  useEffect(() => {
    if (status === null || !status.exists || status.locked) setActiveTab('home');
  }, [status]);

  // o aviso de formato antigo só aparece depois do login, com a chave em mãos para conferir
  useEffect(() => {
    if (!unlocked) {
      setMigration(null);
      setShowMigration(false);
      return;
    }
    void refreshMigration();
  }, [unlocked, refreshMigration]);

  const handleMigrated = async (): Promise<void> => {
    await onRefresh();
    await refreshMigration();
    setToast(m.migration.success);
  };

  const handleLock = async (): Promise<void> => {
    await window.api.vault.lock();
    setActiveTab('home');
    await onRefresh();
  };

  const handleDestroyed = async (): Promise<void> => {
    setActiveTab('home');
    setToast(m.panic.destroyed);
    await onRefresh();
  };

  if (status === null) {
    return (
      <div className="h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center text-sm">
        {m.app.checkingVault}
      </div>
    );
  }

  if (!status.exists || status.locked) {
    return (
      <>
        <AuthModal status={status} onRefresh={onRefresh} />
        <Toast message={toast} onClose={closeToast} />
      </>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        language={language}
        onLanguageChange={onLanguageChange}
        onLock={() => {
          void handleLock();
        }}
        onDestroy={askDestroy}
      />
      {/* `min-w-0` deixa o conteúdo encolher; sem ele, um item largo empurra a barra fora. */}
      <main className="min-w-0 flex-1 bg-slate-950 overflow-y-auto">
        <div className="mx-auto h-full w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {activeTab === 'home' && <Home onToast={setToast} />}
          {activeTab === 'generator' && <Generator onToast={setToast} />}
          {activeTab === 'authenticator' && <Authenticator onToast={setToast} />}
          {activeTab === 'backup' && <Backup onToast={setToast} />}
          {activeTab === 'credits' && <Credits />}
          {activeTab === 'settings' && <Settings />}
        </div>
      </main>
      {confirmDestroy && <DestroyModal onClose={cancelDestroy} onDestroyed={handleDestroyed} />}
      {showMigration && migration !== null && migration.needed && (
        <MigrationModal
          status={migration}
          onLater={() => setShowMigration(false)}
          onDone={handleMigrated}
        />
      )}
      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}

export default function App(): JSX.Element {
  const [language, setLanguage] = useState<Language>('pt-BR');
  const [status, setStatus] = useState<VaultStatus | null>(null);

  const refreshStatus = useCallback(async (): Promise<void> => {
    setStatus(await window.api.vault.status());
  }, []);

  useEffect(() => {
    void (async () => {
      const [settings, vaultStatus] = await Promise.all([
        window.api.settings.get(),
        window.api.vault.status(),
      ]);
      setLanguage(settings.language);
      setStatus(vaultStatus);
    })().catch((error: unknown) => {
      console.error('Falha ao consultar o cofre:', error);
    });
  }, []);

  const unlocked = status !== null && status.exists && !status.locked;

  // Observer: o main avisa no auto-lock; o polling fica como rede de segurança.
  useEffect(() => {
    if (!unlocked) return;
    const unsubscribe = window.api.vault.onAutoLocked(() => {
      void refreshStatus();
    });
    const timer = setInterval(() => {
      void refreshStatus();
    }, STATUS_POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [unlocked, refreshStatus]);

  const handleLanguageChange = useCallback((next: Language): void => {
    void window.api.settings.set({ language: next }).then((saved) => setLanguage(saved.language));
  }, []);

  return (
    <MessagesProvider language={language}>
      <Shell
        status={status}
        language={language}
        onLanguageChange={handleLanguageChange}
        onRefresh={refreshStatus}
      />
    </MessagesProvider>
  );
}
