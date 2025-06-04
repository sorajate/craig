import { captureException, withScope } from '@sentry/node';
import { RouteOptions } from 'fastify';
import fs from 'fs/promises'; // fs/promises is used for async file operations
// For Gemini API, we might need fs.readFileSync or fs.createReadStream if not using uploadFile with path directly.
// However, genAI.uploadFile(filePath) should work with a path string.
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

import { onRequest } from '../influx';
import { ErrorCode, formatTime } from '../util'; // Make sure ErrorCode enum is updated with GEMINI_API_KEY_MISSING, GEMINI_API_ERROR
import { getNotes } from '../util/cook';
import { deleteRecording, getRawRecordingStream, getRecording, getUsers, keyMatches, Recording, recPath } from '../util/recording';

// Define a directory for storing transcripts
// Adjust the path as necessary based on your project structure.
// This typically would be outside the 'src' directory, perhaps in a 'data' or 'files' directory at the root.
// For this example, let's assume it's relative to the dist output of this file.
const TRANSCRIPTS_DIR = path.join(__dirname, '..', '..', '..', 'transcripts_data'); // Adjust if __dirname is not relative to src in runtime.

// Prepares a temporary single audio file from header1, header2, and data parts.
const prepareTemporaryAudioFile = async (recordingId: string): Promise<string | null> => {
  const filePathHeader1 = path.join(recPath, `${recordingId}.ogg.header1`);
  const filePathHeader2 = path.join(recPath, `${recordingId}.ogg.header2`);
  const filePathData = path.join(recPath, `${recordingId}.ogg.data`);
  let tempFilePath: string | null = null;

  try {
    // Check if all source files exist
    await fs.access(filePathHeader1);
    await fs.access(filePathHeader2);
    await fs.access(filePathData);

    // Generate a unique temporary file name
    tempFilePath = path.join(os.tmpdir(), `craig-temp-audio-${crypto.randomBytes(6).toString('hex')}-${recordingId}.ogg`);

    // Read source files and concatenate
    const header1Data = await fs.readFile(filePathHeader1);
    const header2Data = await fs.readFile(filePathHeader2);
    const dataData = await fs.readFile(filePathData);

    const combinedBuffer = Buffer.concat([header1Data, header2Data, dataData]);

    await fs.writeFile(tempFilePath, combinedBuffer);
    console.log(`Temporary audio file created for ${recordingId} at ${tempFilePath}`);
    return tempFilePath;

  } catch (err) {
    console.error(`Error preparing temporary audio file for ${recordingId}:`, err);
    if (tempFilePath) { // Attempt to clean up if partially created
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupErr) {
        console.error(`Error cleaning up temporary file ${tempFilePath}:`, cleanupErr);
      }
    }
    return null;
  }
};
// Note: Ensure ErrorCode.AUDIO_FILE_PREPARATION_FAILED is defined in your ErrorCode enum.

export const headRoute: RouteOptions = {
  method: 'HEAD',
  url: '/api/recording/:id',
  handler: async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    if (!id) return reply.status(400).send({ ok: false, error: 'Invalid ID', code: ErrorCode.INVALID_ID });
    const { key } = request.query as Record<string, string>;
    if (!key) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });
    return reply.status(200).send('OK');
  }
};

export const getRoute: RouteOptions = {
  method: 'GET',
  url: '/api/recording/:id',
  handler: async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    if (!id) return reply.status(400).send({ ok: false, error: 'Invalid ID', code: ErrorCode.INVALID_ID });
    const { key } = request.query as Record<string, string>;
    if (!key) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });

    const info = await getRecording(id);
    if (info === false) return reply.status(410).send({ ok: false, error: 'Recording was deleted', code: ErrorCode.RECORDING_DELETED });
    else if (!info) return reply.status(404).send({ ok: false, error: 'Recording not found', code: ErrorCode.RECORDING_NOT_FOUND });
    if (!keyMatches(info, key)) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });
    onRequest(id);

    delete info.delete;

    return reply.status(200).send({ ok: true, info });
  }
};

export const textRoute: RouteOptions = {
  method: 'GET',
  url: '/api/recording/:id/.txt',
  handler: async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    if (!id) return reply.status(400).send({ ok: false, error: 'Invalid ID', code: ErrorCode.INVALID_ID });
    const { key } = request.query as Record<string, string>;
    if (!key) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });

    const info = await getRecording(id);
    if (info === false) return reply.status(410).send({ ok: false, error: 'Recording was deleted', code: ErrorCode.RECORDING_DELETED });
    else if (!info) return reply.status(404).send({ ok: false, error: 'Recording not found', code: ErrorCode.RECORDING_NOT_FOUND });
    if (!keyMatches(info, key)) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });
    onRequest(id);

    try {
      const users = await getUsers(id);
      const notes = await getNotes(id);

      return reply
        .status(200)
        .headers({
          'content-disposition': `attachment; filename=${id}-info.txt`,
          'content-type': 'text/plain'
        })
        .send(
          [
            `Recording ${id}`,
            '',
            `Guild:\t\t${info.guildExtra ? `${info.guildExtra.name} (${info.guildExtra.id})` : info.guild}`,
            `Channel:\t${info.channelExtra ? `${info.channelExtra.name} (${info.channelExtra.id})` : info.channel}`,
            `Requester:\t${
              info.requesterExtra ? `${info.requesterExtra.username}#${info.requesterExtra.discriminator} (${info.requesterId})` : info.requester
            }`,
            `Start time:\t${info.startTime}`,
            '',
            'Tracks:',
            ...users.map((track) => `\t${track.name || track.username}#${track.discrim || track.discriminator} (${track.id})`),
            ...(notes.length > 0 ? ['', 'Notes:', ...notes.map((n) => `\t${formatTime(parseInt(n.time))}: ${n.note}`)] : [])
          ]
            .filter((x) => x !== null)
            .join('\n')
        );
    } catch (err) {
      withScope((scope) => {
        scope.setTag('recordingID', id);
        captureException(err);
      });
      return reply.status(500).send({ ok: false, error: err.message });
    }
  }
};

export const usersRoute: RouteOptions = {
  method: 'GET',
  url: '/api/recording/:id/users',
  handler: async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    if (!id) return reply.status(400).send({ ok: false, error: 'Invalid ID', code: ErrorCode.INVALID_ID });
    const { key } = request.query as Record<string, string>;
    if (!key) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });

    const info = await getRecording(id);
    if (info === false) return reply.status(410).send({ ok: false, error: 'Recording was deleted', code: ErrorCode.RECORDING_DELETED });
    else if (!info) return reply.status(404).send({ ok: false, error: 'Recording not found', code: ErrorCode.RECORDING_NOT_FOUND });
    if (!keyMatches(info, key)) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });
    onRequest(id);

    const users = await getUsers(id);
    return reply.status(200).send({ ok: true, users });
  }
};

export const rawRoute: RouteOptions = {
  method: 'GET',
  url: '/api/recording/:id/raw',
  handler: async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    if (!id) return reply.status(400).send({ ok: false, error: 'Invalid ID', code: ErrorCode.INVALID_ID });
    const { key } = request.query as Record<string, string>;
    if (!key) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });

    const info = await getRecording(id);
    if (info === false) return reply.status(410).send({ ok: false, error: 'Recording was deleted', code: ErrorCode.RECORDING_DELETED });
    else if (!info) return reply.status(404).send({ ok: false, error: 'Recording not found', code: ErrorCode.RECORDING_NOT_FOUND });
    if (!keyMatches(info, key)) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });
    onRequest(id);

    return reply
      .status(200)
      .headers({
        'content-disposition': `attachment; filename=${id}.ogg`,
        'content-type': 'audio/ogg'
      })
      .send(getRawRecordingStream(id));
  }
};

export const deleteRoute: RouteOptions = {
  method: 'DELETE',
  url: '/api/recording/:id',
  handler: async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    if (!id) return reply.status(400).send({ ok: false, error: 'Invalid ID', code: ErrorCode.INVALID_ID });
    const { key, delete: deleteKey } = request.query as Record<string, string>;
    if (!key) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });
    if (!deleteKey) return reply.status(403).send({ ok: false, error: 'Invalid delete key', code: ErrorCode.INVALID_DELETE_KEY });

    const info = await getRecording(id);
    if (info === false) return reply.status(410).send({ ok: false, error: 'Recording was deleted', code: ErrorCode.RECORDING_DELETED });
    else if (!info) return reply.status(404).send({ ok: false, error: 'Recording not found', code: ErrorCode.RECORDING_NOT_FOUND });
    if (!keyMatches(info, key)) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });
    onRequest(id);
    if (String(info.delete) !== deleteKey)
      return reply.status(403).send({ ok: false, error: 'Invalid delete key', code: ErrorCode.INVALID_DELETE_KEY });

    await deleteRecording(id);

    return reply.status(204).send();
  }
};

export const getTranscriptRoute: RouteOptions = {
  method: 'GET',
  url: '/api/recording/:id/transcript',
  handler: async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    if (!id) return reply.status(400).send({ ok: false, error: 'Invalid ID', code: ErrorCode.INVALID_ID });
    const { key } = request.query as Record<string, string>;
    if (!key) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });

    const info = await getRecording(id);
    if (info === false) return reply.status(410).send({ ok: false, error: 'Recording was deleted', code: ErrorCode.RECORDING_DELETED });
    else if (!info) return reply.status(404).send({ ok: false, error: 'Recording not found', code: ErrorCode.RECORDING_NOT_FOUND });
    if (!keyMatches(info, key)) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });
    onRequest(id);

    const transcriptFilePath = path.join(TRANSCRIPTS_DIR, `${id}.txt`);

    try {
      await fs.access(transcriptFilePath); // Check if file exists and is accessible
      const transcriptContent = await fs.readFile(transcriptFilePath, 'utf-8');
      // Send as plain text, or JSON - client expects text for now based on page component
      return reply.status(200).headers({ 'content-type': 'text/plain' }).send(transcriptContent);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return reply.status(404).send({ ok: false, error: 'Transcript not found', code: ErrorCode.TRANSCRIPT_NOT_FOUND });
      }
      console.error(`Error reading transcript file for ${id}:`, err);
      withScope((scope) => {
        scope.setTag('recordingID', id);
        captureException(err);
      });
      return reply.status(500).send({ ok: false, error: 'Error reading transcript', code: ErrorCode.INTERNAL_SERVER_ERROR });
    }
  }
};

export const postTranscriptRoute: RouteOptions = {
  method: 'POST',
  url: '/api/recording/:id/transcript',
  handler: async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    if (!id) return reply.status(400).send({ ok: false, error: 'Invalid ID', code: ErrorCode.INVALID_ID });
    const { key } = request.query as Record<string, string>;
    if (!key) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });

    const recordingInfo = await getRecording(id);
    if (recordingInfo === false) return reply.status(410).send({ ok: false, error: 'Recording was deleted', code: ErrorCode.RECORDING_DELETED });
    if (!recordingInfo) return reply.status(404).send({ ok: false, error: 'Recording not found', code: ErrorCode.RECORDING_NOT_FOUND });
    if (!keyMatches(recordingInfo, key)) return reply.status(403).send({ ok: false, error: 'Invalid key', code: ErrorCode.INVALID_KEY });
    onRequest(id);

    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not set.');
      // Ensure ErrorCode.GEMINI_API_KEY_MISSING is defined
      return reply.status(500).send({ ok: false, error: 'Gemini API key is missing.', code: ErrorCode.GEMINI_API_KEY_MISSING });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let tempAudioFilePath: string | null = null;
    try {
      // 1. Prepare Temporary Audio File
      tempAudioFilePath = await prepareTemporaryAudioFile(id);
      if (!tempAudioFilePath) {
        console.error(`Audio file preparation failed for recording ${id}`);
        return reply.status(500).send({ ok: false, error: 'Audio file preparation failed for transcription.', code: ErrorCode.AUDIO_FILE_PREPARATION_FAILED });
      }

      // 2. Call Google Gemini API
      console.log(`[Gemini API] Uploading audio file: ${tempAudioFilePath} for recording ${id}`);
      const uploadedFileResponse = await genAI.uploadFile(tempAudioFilePath);
      console.log(`[Gemini API] Audio file uploaded for ${id}. File URI: ${uploadedFileResponse.file.uri}`);

      const prompt = "Please transcribe the following audio recording. After the full transcript, provide a concise summary of the content. Structure your response clearly, with 'Transcript:' and 'Summary:' headings. If the audio is very short or contains no discernible speech, indicate that appropriately.";

      // Optional: Define generation config and safety settings
      const generationConfig = {
        temperature: 0.7,
        topK: 1,
        topP: 1,
        maxOutputTokens: 8192,
      };
      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ];

      console.log(`[Gemini API] Generating content for recording ${id}...`);
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [ {text: prompt}, {fileData: {mimeType: uploadedFileResponse.file.mimeType, fileUri: uploadedFileResponse.file.uri}}]}],
        generationConfig,
        safetySettings
      });

      const response = result.response;
      const transcriptAndSummaryText = response.text();
      console.log(`[Gemini API] Received response for ${id}.`);

      // 3. Save Transcript to File
      await fs.mkdir(TRANSCRIPTS_DIR, { recursive: true });
      const transcriptFilePath = path.join(TRANSCRIPTS_DIR, `${id}.txt`);
      await fs.writeFile(transcriptFilePath, transcriptAndSummaryText);
      console.log(`Transcript and summary saved to ${transcriptFilePath}`);

      // 4. Return Response
      return reply.status(200).headers({ 'content-type': 'text/plain' }).send(transcriptAndSummaryText);

    } catch (err) {
      console.error(`Error during transcription process for ${id}:`, err);
      // Specific check for Gemini API related errors if possible, otherwise general error
      // if (err instanceof GoogleGenerativeAIError) { // Or however Gemini errors are identified
      //   return reply.status(500).send({ ok: false, error: 'Gemini API error.', code: ErrorCode.GEMINI_API_ERROR, details: err.message });
      // }
      withScope((scope) => {
        scope.setTag('recordingID', id);
        if (err.name === 'GoogleGenerativeAIError') { // Example: Check error name or use instanceof
            scope.setExtra('gemini_error_details', err.message);
        }
        captureException(err);
      });
      // Ensure ErrorCode.GEMINI_API_ERROR or a more general TRANSCRIPTION_FAILED is defined
      return reply.status(500).send({ ok: false, error: 'Transcription failed due to API error.', code: ErrorCode.GEMINI_API_ERROR });
    } finally {
      if (tempAudioFilePath) {
        try {
          // It's important to delete the uploaded file from Gemini's storage as well, if it's not done automatically by URI expiration
          // For `uploadFile`, the lifetime of the file is typically 2 days or can be managed via `GoogleAIFileManager`
          // For this POC, we are not explicitly deleting the remote file via API, only the local temp copy.
          // genAI.deleteFile(uploadedFileResponse.file.name); // or uploadedFileResponse.file.uri - check SDK docs
          // console.log(`[Gemini API] Remote file ${uploadedFileResponse.file.name} deletion attempted.`);

          await fs.unlink(tempAudioFilePath);
          console.log(`Temporary audio file ${tempAudioFilePath} deleted.`);
        } catch (cleanupErr) {
          console.error(`Error deleting temporary audio file ${tempAudioFilePath}:`, cleanupErr);
          withScope((scope) => {
            scope.setTag('recordingID', id);
            scope.setExtra('tempAudioFilePath', tempAudioFilePath);
            captureException(cleanupErr);
          });
        }
      }
    }
  }
};
