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
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [accessKey, setAccessKey] = useState<string | null>(null);

  useEffect(() => {
    const pathParts = location.pathname.split('/');
    const recId = pathParts[pathParts.length -1]; // Assuming /transcript/[id]
    const searchParams = new URLSearchParams(location.search);
    const accKey = searchParams.get('key');

    if (recId) setRecordingId(recId);
    if (accKey) setAccessKey(accKey);

    if (recId && accKey) {
      setLoadingRecordingDetails(true);
      getRecording(recId, accKey)
        .then((rec) => {
          setRecording(rec);
          setError(null);
        })
        .catch((err) => {
          console.error('Failed to get recording:', err);
          // Assuming parseError similar to app.tsx exists or can be added
          setError(err.message || t('transcriptPage.error.loadRecordingFailed'));
        })
        .finally(() => {
          setLoadingRecordingDetails(false);
        });
    } else {
      setError(t('transcriptPage.error.missingParams'));
      setLoadingRecordingDetails(false);
    }
  }, [t]); // t added as dependency for error messages

  const handleStartTranscription = useCallback(async () => {
    if (!recordingId || !accessKey) {
      setError(t('transcriptPage.error.missingParamsForTranscription'));
      return;
    }

    setTranscribing(true);
    setError(null);

    try {
      // Placeholder for API call
      // const response = await fetch(`/api/recording/${recordingId}/transcript?key=${accessKey}`, { method: 'POST' });
      // if (!response.ok) {
      //   const errorData = await response.json();
      //   throw new Error(errorData.message || `Error ${response.status}`);
      // }
      // const transcriptData = await response.text(); // Or response.json().transcript if it's structured

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      const mockTranscript = `This is a mock transcript for recording ${recordingId}. It was generated at ${new Date().toLocaleTimeString()}.`;
      setTranscript(mockTranscript);

    } catch (err: any) {
      console.error('Failed to start transcription:', err);
      setError(err.message || t('transcriptPage.error.transcriptionFailed'));
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
            <a href="/" class="text-zinc-400 font-medium hover:underline focus:underline outline-none">
              &larr; {t('transcriptPage.backToDownloads', 'Back to Downloads')}
            </a>
          </div>
        </div>

        {loadingRecordingDetails && (
          <div class="flex justify-center items-center py-10">
            <Spinner />
            <span class="ml-2">{t('transcriptPage.loadingDetails', 'Loading recording details...')}</span>
          </div>
        )}

        {error && (
          <div class="bg-red-800 border border-red-700 text-red-100 px-4 py-3 rounded relative" role="alert">
            <strong class="font-bold">{t('transcriptPage.error.title', 'Error')}: </strong>
            <span class="block sm:inline">{error}</span>
            <span class="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError(null)}>
              <Icon icon={closeIcon} />
            </span>
          </div>
        )}

        {!loadingRecordingDetails && !error && recording && (
          <div class="bg-zinc-800 shadow-md p-6 rounded-lg">
            <h2 class="text-2xl font-semibold mb-4">
              {t('transcriptPage.recording', 'Recording')}: {recording.name || recordingId}
            </h2>
            {/* Could add more recording details here if needed */}
            {/* <p>{t('transcriptPage.id', 'ID')}: {recordingId}</p> */}
            {/* <p>{t('transcriptPage.requester', 'Requested by')}: {recording.requester}</p> */}


            {transcript ? (
              <Fragment>
                <h3 class="text-xl font-semibold mt-6 mb-2">{t('transcriptPage.transcript', 'Transcript')}</h3>
                <pre class="bg-zinc-700 p-4 rounded-md whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {transcript}
                </pre>
                <div class="mt-6 flex gap-4">
                  <Button onClick={handleDownloadTranscript}>
                    {t('transcriptPage.downloadTranscript', 'Download Transcript')}
                  </Button>
                  {/* Optional: Re-transcribe button */}
                  {/* <Button onClick={handleStartTranscription} disabled={transcribing}>
                    {transcribing
                      ? <Fragment><Spinner /> {t('transcriptPage.transcribing', 'Transcribing...')}</Fragment>
                      : t('transcriptPage.reTranscribe', 'Re-transcribe')}
                  </Button> */}
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

        {!loadingRecordingDetails && !error && !recording && (
           <p>{t('transcriptPage.noRecordingFound', 'No recording details found. Please check the URL and access key.')}</p>
        )}

        {/* Footer (simplified) */}
        <div class="text-center text-xs text-zinc-500 mt-10">
          {t('transcriptPage.footer.craigLink', 'Powered by Craig.Chat')}
        </div>
      </div>
    </div>
  );
}
