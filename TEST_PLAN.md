# Test Plan: Audio Transcription Feature

**Prerequisites:**
*   A recording should exist in the system (header1, header2, and data files present).
*   The `GEMINI_API_KEY` environment variable must be correctly set for the backend API.
*   The build process must be updated to include the new i18n translations.
*   The application (bot, dashboard, download page, API) must be running and accessible.

**I. Happy Path Scenarios:**

1.  **Test Case: New Transcription - Successful**
    *   **Steps:**
        1.  Navigate to the main download page for an existing audio recording (e.g., `/rec/[recordingId]`).
        2.  Verify the "Get Transcript" button is visible and enabled.
        3.  Click the "Get Transcript" button.
        4.  Verify navigation to the transcription page (`/transcript/[recordingId]?key=[accessKey]`).
        5.  Verify the page title is "Audio Transcription" (or the i18n equivalent).
        6.  Verify basic recording details are displayed (e.g., Recording ID).
        7.  Verify the "Start Transcription" button is visible and enabled.
        8.  Click the "Start Transcription" button.
        9.  Verify a loading indicator is displayed (e.g., "Transcription in progress, please wait...").
        10. Verify the "Start Transcription" button becomes disabled or changes to a "Transcribing..." state.
        11. Wait for the transcription to complete (this may take some time depending on audio length and API response).
        12. Verify the loading indicator is hidden.
        13. Verify the generated transcript and summary (as returned by Gemini) are displayed, likely under a "Transcript & Summary" label.
        14. Verify the "Download Transcript" button is visible and enabled.
        15. Verify the "Re-transcribe" button is visible and enabled.
    *   **Expected Outcome:** The transcript is successfully generated and displayed. The content of the transcript should accurately reflect the audio recording. UI elements update correctly to reflect the new state.

2.  **Test Case: Download Transcript**
    *   **Steps:**
        1.  Follow Test Case 1 ("New Transcription - Successful") until the transcript and summary are displayed.
        2.  Click the "Download Transcript" button.
    *   **Expected Outcome:** A text file (e.g., `[recordingId].txt` or `[recordingName].txt`) containing the displayed transcript and summary is downloaded to the user's computer. The content of the file should match what is displayed on the page.

3.  **Test Case: View Existing Transcript**
    *   **Steps:**
        1.  Successfully complete Test Case 1 for a specific recording.
        2.  Navigate away from the transcription page (e.g., back to the main download page or another site).
        3.  Navigate back to the transcription page for the *same* recording (`/transcript/[recordingId]?key=[accessKey]`).
        4.  Verify the page loads. During loading, a brief indicator for "Loading recording details..." might appear.
        5.  Verify the page *immediately* displays the previously generated transcript and summary without requiring a click on "Start Transcription".
        6.  Verify the "Download Transcript" button is visible and enabled.
        7.  Verify the "Re-transcribe" button is visible and enabled.
    *   **Expected Outcome:** The existing transcript is fetched from the server and displayed correctly upon page load. No manual action is needed to view it.

4.  **Test Case: Re-transcribe Existing Transcript**
    *   **Steps:**
        1.  Follow Test Case 3 ("View Existing Transcript") until the existing transcript is displayed.
        2.  Click the "Re-transcribe" button.
        3.  Verify a loading indicator (e.g., "Transcription in progress...") is displayed.
        4.  Verify the "Re-transcribe" button becomes disabled or changes state.
        5.  Wait for the transcription to complete.
        6.  Verify the loading indicator is hidden.
        7.  Verify the displayed transcript and summary are updated. (Note: The content might be identical or slightly different if Gemini's model provides a varying result on a subsequent identical request).
        8.  Verify "Download Transcript" and "Re-transcribe" buttons are enabled.
    *   **Expected Outcome:** A new transcription is performed by the backend, and the UI updates to display this new (or refreshed) transcript and summary.

**II. Error Handling and Edge Cases:**

5.  **Test Case: Transcription - Audio File Preparation Fails (Backend)**
    *   **Setup:**
        *   Identify a valid `recordingId`.
        *   On the server, locate the recording files (e.g., in `recPath`).
        *   Temporarily rename or delete one of the required audio parts (e.g., `[recordingId].ogg.header1`, `[recordingId].ogg.header2`, or `[recordingId].ogg.data`).
    *   **Steps:**
        1.  Navigate to the transcription page for the recording ID used in Setup (`/transcript/[recordingId]?key=[accessKey]`).
        2.  Click the "Start Transcription" button (or "Re-transcribe" if a transcript existed before setup).
        3.  Observe the UI for error messages.
    *   **Expected Outcome:**
        *   The UI displays a user-friendly error message (e.g., "Transcription failed: Audio file preparation failed for transcription." or i18n equivalent `transcriptPage.error.transcriptionFailedApi` if the backend returns that specific code, or a general failure message).
        *   The loading indicator for transcription stops.
        *   The "Start Transcription" / "Re-transcribe" button becomes enabled again.
        *   The backend API logs should indicate an error related to `AUDIO_FILE_PREPARATION_FAILED`.
        *   No new transcript file should be saved on the server for this attempt.

6.  **Test Case: Transcription - Gemini API Key Missing (Backend)**
    *   **Setup:**
        *   On the backend server, temporarily unset or comment out the `GEMINI_API_KEY` environment variable.
        *   Restart the backend API service to ensure the change takes effect.
    *   **Steps:**
        1.  Navigate to the transcription page for any valid recording (`/transcript/[recordingId]?key=[accessKey]`).
        2.  Click the "Start Transcription" button (or "Re-transcribe").
    *   **Expected Outcome:**
        *   The UI displays a user-friendly error message (e.g., "Transcription failed: Gemini API key is missing." or i18n equivalent).
        *   The loading indicator stops.
        *   The backend API logs should indicate an error related to `GEMINI_API_KEY_MISSING`.
    *   **Cleanup:** Restore the `GEMINI_API_KEY` and restart the API service.

7.  **Test Case: Transcription - Gemini API Error (e.g., quota, invalid audio)**
    *   **Setup:** This is challenging to reproduce consistently. Potential methods (if feasible and non-disruptive):
        *   If the Gemini SDK allows, temporarily modify the model name in `recording.ts` to an invalid one (e.g., "gemini-1.5-flash-nonexistent") to trigger an API error.
        *   Use an audio file known to cause issues (e.g., extremely short, silent, or in a format Gemini might struggle with, though our OGG should be fine). This would require replacing the prepared audio file temporarily.
    *   **Steps:**
        1.  Navigate to the transcription page for a recording.
        2.  Click "Start Transcription" (or "Re-transcribe").
    *   **Expected Outcome:**
        *   The UI displays a user-friendly error message (e.g., "Transcription failed due to an API error. Please try again later." or i18n equivalent `transcriptPage.error.transcriptionFailedApi`).
        *   The loading indicator stops.
        *   The backend API logs should contain specific error details returned by the Gemini API.
    *   **Cleanup (if setup was modified):** Revert any code changes (like model name) and restart the API.

8.  **Test Case: Invalid Recording ID or Access Key (Client-side and API interaction)**
    *   **Steps:**
        1.  Attempt to navigate directly to `/transcript/INVALID_RECORDING_ID?key=INVALID_KEY`.
        2.  Attempt to navigate to `/transcript/[validRecordingId]?key=INVALID_KEY`.
    *   **Expected Outcome:**
        *   For an invalid recording ID, the page should display an error message like "Failed to load recording details." or "No recording details found." (or i18n equivalent `transcriptPage.error.fetchRecordingFailed` or `transcriptPage.noRecordingFound`).
        *   For an invalid key with a valid recording ID, the backend API should return a 403 or 401, which the client-side `getRecording` call should handle, leading to an error display like "Failed to load recording details."
        *   No transcription-specific buttons ("Start Transcription", etc.) should be active or necessarily visible if recording details cannot be loaded.

**III. UI/UX Details:**

9.  **Test Case: "Back to Recording" Link**
    *   **Steps:**
        1.  Navigate to a transcription page (`/transcript/[recordingId]?key=[accessKey]`).
        2.  Locate and click the "Back to Recording" link (or i18n equivalent `transcriptPage.backToRecordings`).
    *   **Expected Outcome:** The user is navigated back to the main download page for the current recording (e.g., `/rec/[recordingId]`). *Self-correction: The implemented link in `transcript.lazy.tsx` was `href="/dl"`. This test should verify navigation to `/dl` or be updated if the link destination is intended to be specific to the recording.*

10. **Test Case: Loading States and Button Disabling**
    *   **Steps:**
        1.  Navigate to a transcription page for a recording with no existing transcript.
        2.  Observe the initial loading indicator for recording details.
        3.  Once loaded, click "Start Transcription".
        4.  Verify the "Start Transcription" button is disabled and a loading message/spinner related to "Transcription in progress..." is shown.
        5.  Wait for completion. Verify the button changes to "Re-transcribe" and is enabled, and the loading message is gone.
        6.  Click "Re-transcribe".
        7.  Verify the "Re-transcribe" button is disabled and the loading message/spinner appears again.
        8.  (Optional) If possible, use browser developer tools to throttle network speed to better observe loading states.
    *   **Expected Outcome:** Loading indicators are displayed appropriately during all asynchronous operations (initial data load, active transcription). Buttons that trigger operations ("Start Transcription", "Re-transcribe") are disabled while the operation is in progress to prevent multiple submissions. UI elements are updated correctly upon completion.

11. **Test Case: Internationalization (i18n)**
    *   **Setup:** If the application supports language switching and has translations for another language for the new keys.
    *   **Steps:**
        1.  Switch the application language to a non-English language that has the new translations.
        2.  Navigate to the transcription page.
        3.  Verify all new UI elements (page title, button labels, error messages, loading messages) are displayed in the selected language.
        4.  Perform a transcription.
    *   **Expected Outcome:** All text related to the transcription feature is correctly translated according to the selected language and i18n keys.
```
