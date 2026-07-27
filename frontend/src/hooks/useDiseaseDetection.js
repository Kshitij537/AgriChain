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
  const [history, setHistory] = useState([]);

  // Revoke object URL on unmount or replace
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  /**
   * Handles file selection with client-side validation
   * @param {File} selectedFile 
   */
  const selectFile = useCallback((selectedFile) => {
    if (!selectedFile) return;

    // Reset previous prediction and error on new selection
    setPrediction(null);
    setError(null);

    // Client-side validation: MIME type
    if (!ALLOWED_MIME_TYPES.includes(selectedFile.type.toLowerCase())) {
      setError({
        code: 'INVALID_FILE_TYPE',
        message: 'Unsupported file format. Please upload a JPEG, PNG, or WebP image.'
      });
      return;
    }

    // Client-side validation: Max File Size
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError({
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds maximum 10 MB limit. Please select a smaller image.'
      });
      return;
    }

    // Revoke previous URL if exists
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    // Create object URL for preview
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
   * @param {number|null} farmId 
   */
  const detect = useCallback(async (farmId = null) => {
    if (!file || loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await detectDisease(file, farmId);
      setPrediction(data);
    } catch (err) {
      console.error('[useDiseaseDetection] Error:', err.message);
      
      let userFriendlyMessage = err.message || 'Disease detection failed. Please try again.';
      if (err.status === 400) userFriendlyMessage = 'Selected image is invalid or undecodable.';
      if (err.status === 413) userFriendlyMessage = 'Image size exceeds maximum 10 MB limit.';
      if (err.status === 415) userFriendlyMessage = 'Unsupported image file type.';
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
  }, [file, loading]);

  /**
   * Loads prediction history for a farm
   * @param {number} farmId 
   */
  const loadHistory = useCallback(async (farmId) => {
    if (!farmId) return;
    try {
      const records = await getHistoryByFarm(farmId);
      setHistory(records);
    } catch (err) {
      console.warn('[useDiseaseDetection] History load error:', err.message);
    }
  }, []);

  return {
    file,
    previewUrl,
    loading,
    prediction,
    error,
    history,
    selectFile,
    clearSelection,
    detect,
    loadHistory
  };
};

export default useDiseaseDetection;
