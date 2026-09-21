"use client";
import { useCallback, useEffect, useState } from "react";
import { selectSpotifyDevice } from "@/lib/music/spotify/playback-client";
type Device = { id: string; name: string; type: string };
export default function SpotifyDevicePicker({ playing }: { playing: boolean }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/spotify/devices", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load Spotify devices.");
      setDevices(data.devices);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load devices."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { selectSpotifyDevice(null); void refresh(); return () => selectSpotifyDevice(null); }, [refresh]);
  return <div>
    <h3>Spotify Playback Device</h3>
    <p>Open Spotify on this computer, then choose its name below. Music will play through the selected device. Spotify Premium is required.</p>
    <p>Clips start at 1:00. Automatic downbeat alignment is not available for Spotify tracks.</p>
    <label htmlFor="spotify-device">This computer</label>
    <select id="spotify-device" value={selected} disabled={playing || loading} style={{ width: "100%", padding: 12, color: "#fff", background: "#151528" }} onChange={event => { setSelected(event.target.value); selectSpotifyDevice(event.target.value || null); }}>
      <option value="">Choose this computer…</option>
      {devices.map(device => <option key={device.id} value={device.id}>{device.name} ({device.type})</option>)}
    </select>
    <button type="button" className="dj-primary-button" disabled={loading || playing} onClick={() => void refresh()}>{loading ? "Finding devices…" : "Refresh devices"}</button>
    {selected && <p role="status">Playback destination: {devices.find(device => device.id === selected)?.name || "Selected device"}. Pause the game to change it.</p>}
    {!loading && !devices.length && !error && <p>No devices found. Open Spotify here and use its device menu to select “This computer,” then refresh devices.</p>}
    {devices.some((device, index) => devices.findIndex(other => other.name === device.name) !== index) && <p>Several devices have the same name. Open the Spotify desktop app on this computer and refresh to find its computer name before choosing.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
