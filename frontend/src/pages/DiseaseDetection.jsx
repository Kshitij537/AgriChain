import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const DiseaseDetection = () => {
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!image) return;
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setResult({
        disease: 'Leaf Rust',
        confidence: 94,
        severity: 'High',
        recommendation: 'Apply fungicide within 48 hours to prevent spread'
      });
      setLoading(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-primary font-headline mb-4">AI Disease Detection</h1>
            <p className="text-lg text-on-surface-variant">Upload crop images for real-time AI analysis</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Upload Section */}
            <div className="glass-card rounded-xl p-8 shadow-sm border border-emerald-900/5">
              <h2 className="text-2xl font-bold text-primary mb-6 font-headline">Upload Crop Image</h2>
              
              <div className="border-2 border-dashed border-outline-variant rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
                {image ? (
                  <div>
                    <img src={image} alt="Crop" className="w-full h-64 object-cover rounded-lg mb-4" />
                    <button
                      type="button"
                      onClick={() => setImage(null)}
                      className="text-secondary font-bold hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <div>
                    <span className="material-symbols-outlined text-6xl text-primary-container block mb-4">photo_camera</span>
                    <p className="text-primary font-bold mb-2">Click to upload or drag and drop</p>
                    <p className="text-sm text-on-surface-variant">PNG, JPG, GIF up to 10MB</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="image-upload"
                    />
                    <label htmlFor="image-upload" className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              <button
                onClick={handleAnalyze}
                disabled={!image || loading}
                className="w-full mt-8 gradient-primary text-white py-4 rounded-lg font-bold text-lg hover:opacity-90 transition-all disabled:opacity-50"
              >
                {loading ? 'Analyzing...' : 'Analyze Image'}
              </button>
            </div>

            {/* Results Section */}
            <div>
              {result ? (
                <div className="glass-card rounded-xl p-8 shadow-sm border border-emerald-900/5">
                  <h2 className="text-2xl font-bold text-primary mb-6 font-headline">Analysis Result</h2>
                  
                  <div className="space-y-6">
                    <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-sm text-on-surface-variant uppercase font-bold mb-1">Detected Disease</p>
                      <p className="text-2xl font-bold text-secondary">{result.disease}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-on-surface-variant uppercase font-bold mb-1">Confidence</p>
                        <p className="text-2xl font-bold text-secondary">{result.confidence}%</p>
                      </div>
                      <div className="p-4 bg-orange-50 rounded-lg">
                        <p className="text-sm text-on-surface-variant uppercase font-bold mb-1">Severity</p>
                        <p className="text-2xl font-bold text-secondary-container">{result.severity}</p>
                      </div>
                    </div>

                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-sm text-on-surface-variant uppercase font-bold mb-2">Recommendation</p>
                      <p className="text-primary">{result.recommendation}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass-card rounded-xl p-8 shadow-sm border border-emerald-900/5 text-center">
                  <span className="material-symbols-outlined text-6xl text-surface-container-highest block mb-4">info</span>
                  <p className="text-on-surface-variant">Upload and analyze an image to see results</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DiseaseDetection;
