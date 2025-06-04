import { h, Fragment } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import closeIcon from '@iconify-icons/ic/close'; // For error messages
import spinnerIcon from '@iconify-icons/svg-spinners/180-ring'; // Basic spinner

import { getRecording, RecordingInfo } from '../../api'; // Assuming RecordingInfo is exported
// We'll need a generic button component or define a simple one here.
// For now, let's assume a simple button structure.

// Simple Button component (can be replaced with a shared one later)
const Button = (props: h.JSX.HTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    class={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded ${props.class || ''}`}
  />
);

// Simple Spinner component
const Spinner = ()_SHOW_USER_INPUT_FOR_FUNCTION_DEFINITIONS
// TODO: API calls for transcription (POST and GET) will be added later.

export default function TranscriptPage() {
  const { t } = useTranslation();

  const [loadingRecordingDetails, setLoadingRecordingDetails] = useState<boolean>(true);
  const [recording, setRecording] = useState<RecordingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [hasCheckedExisting, setHasCheckedExisting] = useState<boolean>(false); // To prevent re-checking existing
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [accessKey, setAccessKey] = useState<string | null>(null);

  useEffect(() => {
    const pathParts = location.pathname.split('/');
    // Assuming URL is /transcript/[id]
    // If it's /app/transcript/[id] or similar, adjust index accordingly
    const recId = pathParts.length > 2 ? pathParts[2] : null;
    const searchParams = new URLSearchParams(location.search);
    const accKey = searchParams.get('key');

    if (recId) setRecordingId(recId);
    if (accKey) setAccessKey(accKey);

    if (recId && accKey) {
      setLoadingRecordingDetails(true);
      setError(null); // Clear previous errors
      getRecording(recId, accKey)
        .then((rec) => {
          setRecording(rec);
          // Now check for existing transcript
          return fetch(`/api/recording/${recId}/transcript?key=${accKey}`);
        })
        .then(async (transcriptResponse) => {
          if (transcriptResponse.ok) {
            const existingTranscript = await transcriptResponse.text();
            setTranscript(existingTranscript);
          } else if (transcriptResponse.status === 404) {
            setTranscript(null); // No existing transcript
          } else {
            // Handle other errors for fetching existing transcript
            const errorData = await transcriptResponse.json().catch(() => null);
            throw new Error(errorData?.error || `Error ${transcriptResponse.status} checking for existing transcript`);
          }
        })
        .catch((err) => {
          console.error('Failed to load recording details or existing transcript:', err);
          setError(err.message || t('transcriptPage.error.loadRecordingFailed'));
        })
        .finally(() => {
          setLoadingRecordingDetails(false);
          setHasCheckedExisting(true);
        });
    } else {
      setError(t('transcriptPage.error.missingParams'));
      setLoadingRecordingDetails(false);
      setHasCheckedExisting(true);
    }
  }, [t, recordingId, accessKey]); // Ensure effect runs if recId/accKey change e.g. via direct URL nav

  const handleStartTranscription = useCallback(async () => {
    if (!recordingId || !accessKey) {
      setError(t('transcriptPage.error.missingParamsForTranscription'));
      return;
    }

    setTranscribing(true);
    setError(null);

    try {
      const response = await fetch(`/api/recording/${recordingId}/transcript?key=${accessKey}`, {
        method: 'POST',
        headers: {
          // Potentially add other headers if needed by your API, e.g., 'Content-Type': 'application/json'
          // For a POST that triggers an action and returns text, this might be sufficient.
        }
      });

      if (response.ok) {
        const newTranscript = await response.text();
        setTranscript(newTranscript);
      } else {
        const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
        console.error('Transcription API error:', errorData);
        setError(errorData.error || t('transcriptPage.error.transcriptionFailedApi'));
      }
    } catch (err: any) {
      console.error('Failed to start transcription (network/fetch error):', err);
      setError(err.message || t('transcriptPage.error.transcriptionFailedNetwork'));
    } finally {
      setTranscribing(false);
    }
  }, [recordingId, accessKey, t]);

  const handleDownloadTranscript = useCallback(() => {
    if (!transcript) return;
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recording?.name || recordingId || 'transcript'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [transcript, recordingId, recording]);


  // Basic page structure, can be enhanced with shared layout components
  return (
    <div class="min-h-screen bg-zinc-900 text-white font-body">
      <div class="sm:max-w-4xl mx-auto py-12 sm:px-12 px-4 space-y-10">
        {/* Header (simplified, can reuse from app.tsx or a layout component) */}
        <div class="flex flex-row items-center justify-center gap-4">
          <img src="/craig.png" class="w-16 h-16 rounded-full" />
          <div class="flex flex-col">
            <h1 class="sm:text-4xl text-2xl text-zinc-100 font-display">
              {t('transcriptPage.title', 'Recording Transcript')}
            </h1>
            <a href="/dl" class="text-zinc-400 font-medium hover:underline focus:underline outline-none"> {/* Assuming /dl is the main download page listing */}
              &larr; {t('transcriptPage.backToRecordings', 'Back to Recordings')}
            </a>
          </div>
        </div>

        {(loadingRecordingDetails || (!hasCheckedExisting && !error)) && (
          <div class="flex justify-center items-center py-10">
            <Spinner />
            <span class="ml-2">{t('transcriptPage.loadingDetails', 'Loading recording details...')}</span>
          </div>
        )}

        {error && (
          <div class="bg-red-800 border border-red-700 text-red-100 px-4 py-3 rounded relative" role="alert">
            <strong class="font-bold">{t('transcriptPage.error.title', 'Error')}: </strong>
            <span class="block sm:inline">{error}</span>
            <button onClick={() => setError(null)} class="absolute top-0 bottom-0 right-0 px-4 py-3 focus:outline-none">
              <Icon icon={closeIcon} />
            </button>
          </div>
        )}

        {!loadingRecordingDetails && hasCheckedExisting && !error && recording && (
          <div class="bg-zinc-800 shadow-md p-6 rounded-lg">
            <h2 class="text-2xl font-semibold mb-4">
              {t('transcriptPage.recording', 'Recording')}: {recording.name || recordingId}
            </h2>

            {transcript ? (
              <Fragment>
                <h3 class="text-xl font-semibold mt-6 mb-2">{t('transcriptPage.transcript', 'Transcript')}</h3>
                <pre class="bg-zinc-700 p-4 rounded-md whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {transcript}
                </pre>
                <div class="mt-6 flex flex-wrap gap-4">
                  <Button onClick={handleDownloadTranscript}>
                    {t('transcriptPage.downloadTranscript', 'Download Transcript')}
                  </Button>
                  <Button onClick={handleStartTranscription} disabled={transcribing} class="bg-orange-500 hover:bg-orange-700">
                    {transcribing
                      ? <Fragment><Spinner /> {t('transcriptPage.transcribing', 'Transcribing...')}</Fragment>
                      : t('transcriptPage.reTranscribe', 'Re-transcribe')}
                  </Button>
                </div>
              </Fragment>
            ) : (
              <div class="mt-6">
                <Button onClick={handleStartTranscription} disabled={transcribing}>
                  {transcribing ? (
                    <Fragment>
                      <Spinner />
                      <span class="ml-2">{t('transcriptPage.transcribing', 'Transcription in progress...')}</span>
                    </Fragment>
                  ) : (
                    t('transcriptPage.startTranscription', 'Start Transcription')
                  )}
                </Button>
                {transcribing && (
                  <p class="text-zinc-400 mt-2">{t('transcriptPage.transcriptionTakesTime', 'This may take a few minutes.')}</p>
                )}
              </div>
            )}
          </div>
        )}

        {!loadingRecordingDetails && hasCheckedExisting && !error && !recording && (
           <p>{t('transcriptPage.noRecordingFound', 'No recording details found. Please check the URL and access key, or ensure the recording exists.')}</p>
        )}

        {/* Footer (simplified) */}
        <div class="text-center text-xs text-zinc-500 mt-10">
          {t('transcriptPage.footer.craigLink', 'Powered by Craig.Chat')}
        </div>
      </div>
    </div>
  );
}
