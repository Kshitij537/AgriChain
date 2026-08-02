import { useState, useCallback, useEffect } from 'react';
import { detectDisease, getHistoryByFarm } from '../services/diseaseApi';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const useDiseaseDetection = () => {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState(null);

  // Farm Context & History States
  const [selectedFarmId, setSelectedFarmId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  // Revoke object URL on unmount or replace
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  /**
   * Loads prediction history for a farm
   * @param {number|string} farmId 
   */
  const loadHistory = useCallback(async (farmId) => {
    const targetFarmId = farmId || 1;

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const records = await getHistoryByFarm(targetFarmId);
      setHistory(records);
    } catch (err) {
      console.warn('[useDiseaseDetection] History load error:', err.message);
      setHistoryError({
        code: 'HISTORY_LOAD_ERROR',
        message: 'Failed to load detection history. Click to retry.'
      });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Automatically load history when selectedFarmId changes (or default farm 1)
  useEffect(() => {
    loadHistory(selectedFarmId || 1);
  }, [selectedFarmId, loadHistory]);

  /**
   * Handles file selection with client-side validation
   * @param {File} selectedFile 
   */
  const selectFile = useCallback((selectedFile) => {
    if (!selectedFile) return;

    // Reset previous prediction and error on new selection
    setPrediction(null);
    setError(null);

    if (!ALLOWED_MIME_TYPES.includes(selectedFile.type.toLowerCase())) {
      setError({
        code: 'INVALID_FILE_TYPE',
        message: 'Unsupported file format. Please upload a JPEG, PNG, or WebP image.'
      });
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError({
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds maximum 10 MB limit. Please select a smaller image.'
      });
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setFile(selectedFile);
    setPreviewUrl(objectUrl);
  }, [previewUrl]);

  /**
   * Clears the current image selection, preview, and results
   */
  const clearSelection = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setPrediction(null);
    setError(null);
  }, [previewUrl]);

  /**
   * Triggers disease prediction for the selected image
   * @param {number|null} farmIdOverride 
   */
  const detect = useCallback(async (farmIdOverride = null) => {
    if (!file || loading) return;

    const activeFarmId = farmIdOverride || selectedFarmId;

    setLoading(true);
    setError(null);

    try {
      const data = await detectDisease(file, activeFarmId);
      setPrediction(data);

      // Refresh history immediately for active farm context
      const targetFarmId = activeFarmId || selectedFarmId || 1;
      loadHistory(targetFarmId);
    } catch (err) {
      console.error('[useDiseaseDetection] Error:', err.message);
      
      let userFriendlyMessage = err.message || 'Disease detection failed. Please try again.';
      if (err.status === 400) userFriendlyMessage = 'Selected image is invalid or undecodable.';
      if (err.status === 413) userFriendlyMessage = 'Image size exceeds maximum 10 MB limit.';
      if (err.status === 415) userFriendlyMessage = 'Unsupported image file type.';
      if (err.status === 403) userFriendlyMessage = 'You do not have access to record detections for this farm.';
      if (err.status === 503) userFriendlyMessage = 'Disease detection engine is temporarily offline. Please try again shortly.';
      if (err.status === 504) userFriendlyMessage = 'Disease detection request timed out. Please try again.';

      setError({
        code: err.code || 'DETECTION_FAILED',
        message: userFriendlyMessage,
        status: err.status
      });
    } finally {
      setLoading(false);
    }
  }, [file, loading, selectedFarmId, loadHistory]);

  return {
    file,
    previewUrl,
    loading,
    prediction,
    error,
    selectedFarmId,
    setSelectedFarmId,
    history,
    historyLoading,
    historyError,
    selectFile,
    clearSelection,
    detect,
    loadHistory
  };
};

export default useDiseaseDetection;
