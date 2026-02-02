'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';

interface Settings {
  id?: string;
  businessAddress: string;
  calendlyUrl: string;
  confidenceThreshold: number;
  deliverabilityThreshold: number;
  maxWords: number;
  sendingCapPerDay: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    businessAddress: '27 Orchard Pl, New York, NY 12601',
    calendlyUrl: 'https://calendly.com/sagar-callsphere/new-meeting',
    confidenceThreshold: 70,
    deliverabilityThreshold: 70,
    maxWords: 110,
    sendingCapPerDay: 100,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setSettings(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error('Failed to save');

      setMessage('Settings saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${message.includes('success') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sender Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Business Address</label>
              <textarea
                value={settings.businessAddress}
                onChange={(e) => setSettings({ ...settings, businessAddress: e.target.value })}
                rows={2}
                className="input"
                placeholder="27 Orchard Pl, New York, NY 12601"
              />
              <p className="text-xs text-gray-500 mt-1">This appears in the email footer</p>
            </div>
            <div>
              <label className="label">Calendly URL</label>
              <input
                type="url"
                value={settings.calendlyUrl}
                onChange={(e) => setSettings({ ...settings, calendlyUrl: e.target.value })}
                className="input"
                placeholder="https://calendly.com/your-link"
              />
              <p className="text-xs text-gray-500 mt-1">The only link allowed in emails</p>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quality Thresholds</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Confidence Threshold (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.confidenceThreshold}
                onChange={(e) => setSettings({ ...settings, confidenceThreshold: parseInt(e.target.value) || 0 })}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Emails below this score need review</p>
            </div>
            <div>
              <label className="label">Deliverability Threshold (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.deliverabilityThreshold}
                onChange={(e) => setSettings({ ...settings, deliverabilityThreshold: parseInt(e.target.value) || 0 })}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Must meet this score to approve</p>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Limits</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Max Words per Email</label>
              <input
                type="number"
                min="50"
                max="200"
                value={settings.maxWords}
                onChange={(e) => setSettings({ ...settings, maxWords: parseInt(e.target.value) || 110 })}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Recommended: 70-110 words</p>
            </div>
            <div>
              <label className="label">Daily Sending Cap</label>
              <input
                type="number"
                min="1"
                max="1000"
                value={settings.sendingCapPerDay}
                onChange={(e) => setSettings({ ...settings, sendingCapPerDay: parseInt(e.target.value) || 100 })}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Max emails to send per day</p>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Environment Info</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">From Name</span>
              <span className="font-medium">CallSphere</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">From Email</span>
              <span className="font-medium">greetings@callsphere.tech</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">SMTP Host</span>
              <span className="font-medium">{process.env.NEXT_PUBLIC_SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com'}</span>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              SMTP credentials and other sensitive settings are configured via environment variables.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
