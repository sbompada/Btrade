import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import {
  ApiError,
  adminMarketDataApi,
  canAccess,
  type GitHubMinuteDiscovery,
  type GitHubMinuteImport,
  type MarketUpload,
  type MarketUploadDay,
} from '../lib/api';
import { istDateTime } from '../lib/format';

const dateTime = (value: string) => istDateTime(value);
const DEFAULT_GITHUB_FOLDER = 'https://github.com/ShabbirHasan1/NSE-Data/tree/main/NSE%20Minute%20Data/NSE_Stocks_Data';
const fileSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function AdminMarketData() {
  const { token, user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploads, setUploads] = useState<MarketUpload[]>([]);
  const [days, setDays] = useState<MarketUploadDay[]>([]);
  const [githubImports, setGithubImports] = useState<GitHubMinuteImport[]>([]);
  const [githubFolderUrl, setGithubFolderUrl] = useState(DEFAULT_GITHUB_FOLDER);
  const [githubDiscovery, setGithubDiscovery] = useState<GitHubMinuteDiscovery | null>(null);
  const [githubSearch, setGithubSearch] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubProgress, setGithubProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const result = await adminMarketDataApi.list(token);
    setUploads(result.uploads);
    setDays(result.days);
    setGithubImports(result.githubImports);
  }, [token]);

  useEffect(() => {
    refresh().catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Could not load import history.'));
  }, [refresh]);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setError(null);
    setFlash(null);
  };

  const upload = async () => {
    if (!token || !file) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const { upload: result, warnings } = await adminMarketDataApi.upload(token, file);
      const summary = `${result.importedRows} rows imported, ${result.duplicateRows} duplicates skipped, ${result.rejectedRows} rejected.`;
      setFlash(warnings.length ? `${summary} ${warnings[0]}` : summary);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      await refresh();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Could not upload the file.');
    } finally {
      setBusy(false);
    }
  };

  const deleteDay = async (day: MarketUploadDay) => {
    if (!token || !window.confirm(`Delete ${day.rowCount} imported rows for ${day.tradingDate}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const result = await adminMarketDataApi.deleteDay(token, day.tradingDate);
      setFlash(`${result.deletedRows} rows deleted for ${day.tradingDate}.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Could not delete that trading day.');
    } finally {
      setBusy(false);
    }
  };

  const discoverGitHub = async () => {
    if (!token || !githubFolderUrl.trim()) return;
    setGithubBusy(true);
    setError(null);
    setFlash(null);
    setGithubProgress('Inspecting GitHub folder…');
    try {
      const result = await adminMarketDataApi.discoverGitHub(token, githubFolderUrl.trim());
      setGithubDiscovery(result);
      setSelectedPaths(new Set());
      setGithubProgress(null);
      setFlash(`${result.files.length} minute-data files found in ${result.source.repository}.`);
    } catch (reason) {
      setGithubDiscovery(null);
      setGithubProgress(null);
      setError(reason instanceof ApiError ? reason.message : 'Could not inspect the GitHub folder.');
    } finally {
      setGithubBusy(false);
    }
  };

  const toggleGitHubFile = (path: string) => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const importGitHub = async () => {
    if (!token || !githubDiscovery || !selectedPaths.size) return;
    const selected = githubDiscovery.files.filter((item) => selectedPaths.has(item.path) && item.supported);
    if (selected.length > 1 && !window.confirm(`Import ${selected.length} minute-data files? Large files can take several minutes each.`)) return;

    setGithubBusy(true);
    setError(null);
    setFlash(null);
    const failures: string[] = [];
    let importedFiles = 0;
    let importedRows = 0;
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const item = selected[index];
        setGithubProgress(`Importing ${item.symbol} (${index + 1} of ${selected.length})…`);
        try {
          const result = await adminMarketDataApi.importGitHubFile(token, githubDiscovery.source.url, item.path);
          importedFiles += 1;
          importedRows += result.import.importedMinuteRows;
        } catch (reason) {
          failures.push(`${item.symbol}: ${reason instanceof ApiError ? reason.message : 'Import failed.'}`);
        }
      }
      await refresh();
      setSelectedPaths(new Set());
      if (importedFiles) setFlash(`${importedFiles} file${importedFiles === 1 ? '' : 's'} imported with ${importedRows.toLocaleString('en-IN')} new minute candles.`);
      if (failures.length) setError(`${failures.length} import${failures.length === 1 ? '' : 's'} failed. ${failures[0]}`);
    } finally {
      setGithubProgress(null);
      setGithubBusy(false);
    }
  };

  const latest = uploads[0];
  const visibleGitHubFiles = githubDiscovery?.files.filter((item) => {
    const query = githubSearch.trim().toLowerCase();
    return !query || item.symbol.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
  }) ?? [];
  const selectableVisiblePaths = visibleGitHubFiles.filter((item) => item.supported).map((item) => item.path);

  return (
    <AppShell tabs={['Market data']} withWatchlist={false}>
      {error && <div className="notice error" role="alert">{error}</div>}
      {flash && <div className="notice info" role="status">{flash}</div>}

      <section className="panel market-upload-panel">
        <div className="panel-head">
          <span className="panel-title">Import daily market data</span>
          <div className="panel-actions">
            <Link className="chip" to="/dashboard">Open Marketwatch</Link>
            <Link className="chip" to="/support/marketwatch">Marketwatch guide</Link>
            {canAccess(user, 'admin.payment_integrations') && <Link className="chip" to="/admin/payment-integrations">Payment integrations</Link>}
            {canAccess(user, 'admin.notification_providers') && <Link className="chip" to="/admin/providers">Notification providers</Link>}
          </div>
        </div>
        <div className="market-upload-form">
          <div className="market-upload-copy">
            <strong>CSV or XLSX</strong>
            <span>Required columns: Symbol, Date, Open, High, Low, Close. Maximum file size: 10 MB.</span>
            <span>Later uploads append new symbol/date rows. Existing rows are skipped as duplicates.</span>
          </div>
          <label className="market-file-picker">
            <Icon.Doc size={16} />
            <span>{file?.name ?? 'Choose a file'}</span>
            <input ref={inputRef} type="file" accept=".csv,.xlsx" onChange={chooseFile} />
          </label>
          <button className="btn primary" disabled={!file || busy} onClick={upload}>
            {busy ? 'Importing…' : 'Upload and append'}
          </button>
        </div>
      </section>

      <section className="panel github-import-panel">
        <div className="panel-head">
          <span className="panel-title">Import GitHub minute data</span>
          <span className="panel-count">PUBLIC REPOSITORIES</span>
        </div>
        <div className="github-import-source">
          <label>
            <span>GitHub folder URL</span>
            <input
              type="url"
              value={githubFolderUrl}
              disabled={githubBusy}
              onChange={(event) => setGithubFolderUrl(event.target.value)}
              placeholder="https://github.com/owner/repository/tree/main/folder"
            />
          </label>
          <button className="btn" disabled={githubBusy || !githubFolderUrl.trim()} onClick={discoverGitHub}>
            {githubBusy && !githubDiscovery ? 'Inspecting…' : 'Inspect folder'}
          </button>
        </div>

        {githubDiscovery && (
          <>
            <div className="github-import-toolbar">
              <div className="market-upload-copy">
                <strong>{githubDiscovery.source.repository} · {githubDiscovery.source.branch}</strong>
                <span>{githubDiscovery.files.length} minute CSV files · up to {fileSize(githubDiscovery.maximumFileBytes)} per file</span>
              </div>
              <input
                className="github-symbol-search"
                type="search"
                value={githubSearch}
                onChange={(event) => setGithubSearch(event.target.value)}
                placeholder="Search symbol"
                aria-label="Search GitHub symbols"
              />
              <button
                className="chip"
                disabled={!selectableVisiblePaths.length || githubBusy}
                onClick={() => setSelectedPaths((current) => new Set([...current, ...selectableVisiblePaths]))}
              >
                Select visible
              </button>
              <button className="chip" disabled={!selectedPaths.size || githubBusy} onClick={() => setSelectedPaths(new Set())}>Clear</button>
            </div>
            <div className="github-file-list" aria-label="GitHub minute-data files">
              {visibleGitHubFiles.map((item) => (
                <label className={`github-file-row${item.supported ? '' : ' disabled'}`} key={item.path}>
                  <input
                    type="checkbox"
                    checked={selectedPaths.has(item.path)}
                    disabled={!item.supported || githubBusy}
                    onChange={() => toggleGitHubFile(item.path)}
                  />
                  <strong>{item.symbol}</strong>
                  <span title={item.name}>{item.name}</span>
                  <span className="num">{fileSize(item.size)}</span>
                </label>
              ))}
              {!visibleGitHubFiles.length && <div className="stub market-data-empty"><span>No symbols match this search.</span></div>}
            </div>
            <div className="github-import-actions">
              <span>{githubProgress ?? `${selectedPaths.size} file${selectedPaths.size === 1 ? '' : 's'} selected`}</span>
              <button className="btn primary" disabled={!selectedPaths.size || githubBusy} onClick={importGitHub}>
                {githubBusy ? 'Importing…' : 'Import selected'}
              </button>
            </div>
          </>
        )}
      </section>

      {latest && (
        <section className="panel latest-upload">
          <div className="panel-head"><span className="panel-title">Last uploaded file</span></div>
          <div className="latest-upload-body">
            <Icon.Doc size={18} />
            <div><strong>{latest.filename}</strong><span>{dateTime(latest.uploadedAt)} by {latest.uploadedBy}</span></div>
            <div className="latest-upload-stats num">
              <span>{latest.importedRows} imported</span>
              <span>{latest.duplicateRows} duplicates</span>
              <span>{latest.rejectedRows} rejected</span>
            </div>
          </div>
        </section>
      )}

      <div className="admin-data-grid">
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">Imported trading days</span>
            <span className="panel-count num">({days.length})</span>
          </div>
          {days.length ? days.map((day) => (
            <div className="market-data-row" key={day.tradingDate}>
              <div><strong className="num">{day.tradingDate}</strong><span>{day.rowCount} active rows from {day.uploadCount} upload{day.uploadCount === 1 ? '' : 's'}</span></div>
              <button className="chip danger" disabled={busy} onClick={() => deleteDay(day)} aria-label={`Delete imported data for ${day.tradingDate}`}>
                <Icon.Trash /> Delete day
              </button>
            </div>
          )) : <div className="stub market-data-empty"><span>No imported trading days.</span></div>}
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">Upload history</span>
            <span className="panel-count num">({uploads.length})</span>
          </div>
          {uploads.length ? uploads.map((item, index) => (
            <div className="market-data-row" key={item.id}>
              <div><strong>{item.filename}{index === 0 && <span className="tag">LATEST</span>}</strong><span>{dateTime(item.uploadedAt)} · {item.uploadedBy}</span></div>
              <div className="market-upload-count num"><strong>{item.activeRows}</strong><span>active / {item.importedRows} imported</span></div>
            </div>
          )) : <div className="stub market-data-empty"><span>No files uploaded yet.</span></div>}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">GitHub minute import history</span>
          <span className="panel-count num">({githubImports.length})</span>
        </div>
        {githubImports.length ? githubImports.map((item) => (
          <div className="market-data-row" key={item.id}>
            <div>
              <strong>{item.symbol}<span className="tag">MIN</span></strong>
              <span>{item.repository} · {dateTime(item.importedAt)} · {item.importedBy}</span>
            </div>
            <div className="market-upload-count num">
              <strong>{item.importedMinuteRows.toLocaleString('en-IN')} new</strong>
              <span>{item.duplicateMinuteRows.toLocaleString('en-IN')} duplicates · {item.rejectedRows.toLocaleString('en-IN')} rejected</span>
            </div>
          </div>
        )) : <div className="stub market-data-empty"><span>No GitHub minute files imported yet.</span></div>}
      </section>
    </AppShell>
  );
}