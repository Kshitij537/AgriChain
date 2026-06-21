import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

const SavedFields = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [cropFilter, setCropFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [fields, setFields] = useState([]);
  const [filteredFields, setFilteredFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingFieldIds, setDeletingFieldIds] = useState(() => new Set());
  const [selectedFieldIds, setSelectedFieldIds] = useState(() => new Set());

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Fetch farms from backend on component mount
  useEffect(() => {
    const fetchFarms = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('📡 Fetching farms from:', `${API_BASE_URL}/api/farms/user`);

        const response = await fetch(`${API_BASE_URL}/api/farms/user`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        console.log('📊 Response Status:', response.status);

        if (!response.ok) {
          throw new Error(`Failed to fetch farms: ${response.status}`);
        }

        const data = await response.json();
        console.log('📋 Response Data:', data);

        if (data.success && data.farms && data.farms.length > 0) {
          console.log(`✓ Found ${data.farms.length} farms`);
          
          // Transform API response to component format
          const transformedFields = data.farms.map((farm) => {
            console.log('🌾 Processing farm:', { id: farm.id, name: farm.name, ndviValue: farm.ndviValue, healthStatus: farm.healthStatus });
            
            // Determine status and color based on NDVI health status
            let status = 'Good';
            let statusColor = 'primary';
            
            if (farm.healthStatus) {
              status = farm.healthStatus;
              if (farm.healthStatus === 'Good') {
                statusColor = 'primary';
              } else if (farm.healthStatus === 'Moderate') {
                statusColor = 'warning';
              } else if (farm.healthStatus === 'Poor') {
                statusColor = 'error';
              }
            }

            return {
              id: farm.id,
              name: farm.name || 'Unnamed Field',
              crop: farm.cropType || 'Unknown',
              area: farm.area || 0,
              status: status,
              statusColor: statusColor,
              ndviValue: farm.ndviValue ? farm.ndviValue.toFixed(2) : 'N/A',
              ndviTrend: '+0.0%', // Can be enhanced with historical data
              trend: 'stable',
              image: farm.imageUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDS9EhHAn698C43mf5Vmrjqf-HNbjaOF56jYJf8FnM9wrAQmgyC31y1zaE5TGCzJEe1CUsGjepU4g5b-Mqf0ld4KoiIFMbxSJkYCDOTK1ky8kS6JjOTmJKEDLfb5nutCXJsQBsH1M0au60u6jbTm7cVdHoQE9r2y9Om1elJQAHLGvQ5o4tjmAf2hH208dgJGLYjfCfiJcAFWNHZ9zXQSV0CFzZvfH6zURb2pBSSexULiV5Eqq5lrIjd0JObxQzkw22cENcEDRUracQ',
              sparkline: [50, 55, 52, 58, 65, 72],
              alert: false,
            };
          });

          setFields(transformedFields);
          console.log('✓ Fields loaded:', transformedFields.length);
        } else {
          console.log('ℹ No farms returned or empty list');
          setFields([]);
        }
      } catch (err) {
        console.error('❌ Error fetching farms:', err);
        setError(err.message);
        setFields([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFarms();
  }, [API_BASE_URL]);

  // Handle filtering
  useEffect(() => {
    let filtered = fields;

    // Search filter
    if (searchInput.trim()) {
      filtered = filtered.filter(
        (field) =>
          field.name.toLowerCase().includes(searchInput.toLowerCase()) ||
          field.crop.toLowerCase().includes(searchInput.toLowerCase())
      );
    }

    // Crop filter
    if (cropFilter !== 'All Crops' && cropFilter !== 'All') {
      filtered = filtered.filter((field) => field.crop === cropFilter);
    }

    // Status filter
    if (statusFilter !== 'All Status' && statusFilter !== 'All') {
      filtered = filtered.filter((field) => field.status === statusFilter);
    }

    setFilteredFields(filtered);
  }, [searchInput, cropFilter, statusFilter, fields]);

  const handleAddField = () => {
    navigate('/farm-boundary-setup');
  };

  const handleEditField = (fieldId) => {
    if (!fieldId) return;
    navigate(`/farm-boundary-setup/${fieldId}`);
  };

  const toggleSelected = (fieldId, nextSelected) => {
    setSelectedFieldIds((prev) => {
      const updated = new Set(prev);
      if (nextSelected) updated.add(fieldId);
      else updated.delete(fieldId);
      return updated;
    });
  };

  const isAllFilteredSelected =
    filteredFields.length > 0 && filteredFields.every((f) => selectedFieldIds.has(f.id));

  const handleSelectAllFiltered = () => {
    setSelectedFieldIds((prev) => {
      const updated = new Set(prev);
      const shouldSelectAll = !isAllFilteredSelected;

      for (const field of filteredFields) {
        if (shouldSelectAll) updated.add(field.id);
        else updated.delete(field.id);
      }

      return updated;
    });
  };

  const deleteFieldById = async (fieldId) => {
    const response = await fetch(`${API_BASE_URL}/api/farms/${fieldId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      let message = `Failed to delete field: ${response.status}`;
      try {
        const data = await response.json();
        message = data?.error || data?.message || message;
      } catch {
        // ignore json parse errors
      }
      throw new Error(message);
    }
  };

  const getSparklineHeights = (sparkline) => {
    const maxValue = Math.max(...sparkline);
    return sparkline.map((value) => (value / maxValue) * 100);
  };

  const getStatusIcon = (status) => {
    if (status === 'Good' || status === 'Excellent') return 'check_circle';
    if (status === 'Moderate') return 'warning';
    if (status === 'Poor') return 'cancel';
    return 'check_circle';
  };

  const getStatusColor = (status) => {
    if (status === 'Good' || status === 'Excellent') return 'bg-primary/90';
    if (status === 'Moderate') return 'bg-secondary/90';
    if (status === 'Poor') return 'bg-error/90';
    return 'bg-primary/90';
  };

  const handleDeleteField = async (fieldId) => {
    if (!fieldId) return;

    try {
      setDeletingFieldIds((prev) => new Set(prev).add(fieldId));
      await deleteFieldById(fieldId);
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      setSelectedFieldIds((prev) => {
        const updated = new Set(prev);
        updated.delete(fieldId);
        return updated;
      });
    } catch (err) {
      console.error('❌ Error deleting field:', err);
    } finally {
      setDeletingFieldIds((prev) => {
        const updated = new Set(prev);
        updated.delete(fieldId);
        return updated;
      });
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedFieldIds);
    if (ids.length === 0) return;

    try {
      setDeletingFieldIds((prev) => {
        const updated = new Set(prev);
        for (const id of ids) updated.add(id);
        return updated;
      });

      const results = await Promise.allSettled(ids.map((id) => deleteFieldById(id)));
      const succeededIds = ids.filter((_, idx) => results[idx].status === 'fulfilled');

      if (succeededIds.length > 0) {
        setFields((prev) => prev.filter((f) => !succeededIds.includes(f.id)));
        setSelectedFieldIds((prev) => {
          const updated = new Set(prev);
          for (const id of succeededIds) updated.delete(id);
          return updated;
        });
      }

      const failed = results.find((r) => r.status === 'rejected');
      if (failed) {
        console.error('❌ One or more deletions failed:', failed.reason);
      }
    } finally {
      setDeletingFieldIds((prev) => {
        const updated = new Set(prev);
        for (const id of ids) updated.delete(id);
        return updated;
      });
    }
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <main className="flex-1 ml-72 overflow-y-auto px-12 py-10">
        {/* Header & Search Bar */}
        <header className="flex flex-col gap-8 mb-12">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-5xl font-headline font-extrabold text-primary tracking-tighter mb-2">
                Saved Fields
              </h2>
              <p className="text-lg text-on-surface-variant font-medium">
                Manage your {fields.length} active {fields.length === 1 ? 'field' : 'fields'} across North America.
              </p>
            </div>
            <div className="flex gap-4">
              <button className="flex items-center gap-2 px-6 py-3 bg-surface-container-high text-primary font-semibold rounded-full hover:bg-surface-container-highest transition-all scale-95 active:scale-90">
                <span className="material-symbols-outlined">filter_list</span>
                Filter
              </button>
              <button
                onClick={handleAddField}
                className="signature-gradient text-white px-8 py-3 rounded-full font-bold shadow-lg hover:shadow-primary/20 transition-all scale-95 active:scale-90 flex items-center gap-2"
              >
                <span className="material-symbols-outlined">add</span>
                Add New Field
              </button>
            </div>
          </div>

          {/* Bento Style Filters & Alerts */}
          <div className="grid grid-cols-12 gap-6">
            {/* Search and Filter Bar */}
            <div className="col-span-8 glass-panel rounded-lg p-6 flex items-center gap-8 shadow-[0px_24px_48px_rgba(26,28,25,0.06)]">
              <div className="flex-1 relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search by name, crop or area..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full bg-surface-container-highest/40 border-none rounded-full pl-12 pr-6 py-3 focus:ring-2 focus:ring-primary/40 transition-all text-on-surface"
                />
              </div>
              <div className="flex gap-4">
                <select
                  value={cropFilter}
                  onChange={(e) => setCropFilter(e.target.value)}
                  className="bg-surface-container-low border-none rounded-full px-6 py-3 text-sm font-medium focus:ring-primary/20"
                >
                  <option>All Crops</option>
                  {[...new Set(fields.map((f) => f.crop))].map((crop) => (
                    <option key={crop} value={crop}>
                      {crop}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-surface-container-low border-none rounded-full px-6 py-3 text-sm font-medium focus:ring-primary/20"
                >
                  <option>All Status</option>
                  <option>Good</option>
                  <option>Moderate</option>
                  <option>Poor</option>
                </select>
              </div>
            </div>

            {/* Critical Alerts */}
            <div className="col-span-4 bg-error-container/20 rounded-lg p-6 border border-error/5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-bold text-error flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                    report_problem
                  </span>
                  Critical Alerts
                </h3>
                <span className="bg-error text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">
                  {fields.filter((f) => f.alert).length} New
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {fields
                  .filter((f) => f.alert)
                  .slice(0, 2)
                  .map((field) => (
                    <div key={field.id} className="flex items-center gap-3 p-3 bg-white/60 rounded-xl">
                      <div className="w-2 h-2 rounded-full bg-error animate-pulse"></div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-on-surface">
                          {field.status === 'Poor' ? 'Health Critical: ' : 'Attention Needed: '}
                          {field.name}
                        </p>
                        <p className="text-[10px] text-on-surface-variant">
                          {field.status === 'Poor'
                            ? 'NDVI trend declining rapidly'
                            : 'Check field status immediately'}
                        </p>
                      </div>
                    </div>
                  ))}
                {fields.filter((f) => f.alert).length === 0 && (
                  <p className="text-xs text-on-surface-variant italic">No critical alerts</p>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Field Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="animate-spin mb-4">
              <span className="material-symbols-outlined text-6xl text-primary">
                cloud_download
              </span>
            </div>
            <h3 className="text-xl font-headline font-bold text-on-surface mb-2">Loading fields...</h3>
            <p className="text-on-surface-variant">Fetching your saved field data</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24">
            <span className="material-symbols-outlined text-6xl text-error mb-4">
              error_outline
            </span>
            <h3 className="text-xl font-headline font-bold text-on-surface mb-2">Error loading fields</h3>
            <p className="text-on-surface-variant mb-6 max-w-md text-center">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-primary text-white rounded-full font-semibold hover:shadow-lg transition-shadow"
            >
              Try Again
            </button>
          </div>
        ) : filteredFields.length > 0 ? (
          <div className="flex flex-col gap-6">
            {/* Bulk actions */}
            <div className="glass-panel rounded-lg px-5 py-3 flex items-center justify-between shadow-[0px_24px_48px_rgba(26,28,25,0.06)]">
              <label className="flex items-center gap-3 text-sm font-semibold text-on-surface select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-outline/30 accent-primary focus:ring-primary/30"
                  checked={isAllFilteredSelected}
                  onChange={handleSelectAllFiltered}
                  aria-label="Select all filtered fields"
                />
                <span className="font-bold">Select all</span>
                <span className="text-on-surface-variant font-medium">({selectedFieldIds.size} selected)</span>
              </label>

              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedFieldIds.size === 0}
                className="px-5 py-2 rounded-full font-bold bg-error text-white hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete selected
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredFields.map((field) => (
              <FieldCard
                key={field.id}
                field={field}
                getSparklineHeights={getSparklineHeights}
                getStatusIcon={getStatusIcon}
                getStatusColor={getStatusColor}
                onEdit={handleEditField}
                onDelete={handleDeleteField}
                onViewAnalytics={() => navigate(`/field-analytics/${field.id}`)}
                isDeleting={deletingFieldIds.has(field.id)}
                selected={selectedFieldIds.has(field.id)}
                onSelectChange={(nextSelected) => toggleSelected(field.id, nextSelected)}
              />
            ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24">
            <span className="material-symbols-outlined text-6xl text-outline-variant mb-4">
              search_off
            </span>
            <h3 className="text-xl font-headline font-bold text-on-surface mb-2">No fields found</h3>
            <p className="text-on-surface-variant mb-6 max-w-md text-center">
              {fields.length === 0
                ? 'No fields yet. Click "Add New Field" to create your first field.'
                : 'Try adjusting your filters or search terms'}
            </p>
            {fields.length === 0 && (
              <button
                onClick={handleAddField}
                className="signature-gradient text-white px-8 py-3 rounded-full font-bold shadow-lg hover:shadow-primary/20 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined">add</span>
                Create First Field
              </button>
            )}
          </div>
        )}
      </main>

      {/* AI Pulse Floating Action */}
      <div className="fixed bottom-10 right-10 flex items-center gap-4 bg-primary text-white pl-4 pr-6 py-4 rounded-full shadow-2xl border border-primary-fixed/20 z-50">
        <div className="relative">
          <span className="material-symbols-outlined text-primary-fixed">psychology</span>
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary-fixed rounded-full animate-ping"></span>
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary-fixed rounded-full"></span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary-fixed/80">
            AI Insights
          </span>
          <span className="text-sm font-semibold">Yield Forecast Ready</span>
        </div>
      </div>
    </div>
  );
};

// Field Card Component
const FieldCard = ({ field, getSparklineHeights, getStatusIcon, getStatusColor, onEdit, onDelete, onViewAnalytics, isDeleting, selected, onSelectChange }) => {
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);
  
  const heights = getSparklineHeights(field.sparkline);
  const statusIcon = getStatusIcon(field.status);
  const statusColorClass = getStatusColor(field.status);

  const fallbackImage = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDS9EhHAn698C43mf5Vmrjqf-HNbjaOF56jYJf8FnM9wrAQmgyC31y1zaE5TGCzJEe1CUsGjepU4g5b-Mqf0ld4KoiIFMbxSJkYCDOTK1ky8kS6JjOTmJKEDLfb5nutCXJsQBsH1M0au60u6jbTm7cVdHoQE9r2y9Om1elJQAHLGvQ5o4tjmAf2hH208dgJGLYjfCfiJcAFWNHZ9zXQSV0CFzZvfH6zURb2pBSSexULiV5Eqq5lrIjd0JObxQzkw22cENcEDRUracQ';
  const displayImage = imageError ? fallbackImage : field.image;

  React.useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleDeleteClick = async () => {
    if (isDeleting) return;
    setMenuOpen(false);
    await onDelete?.(field.id);
  };

  const handleEditClick = () => {
    setMenuOpen(false);
    onEdit?.(field.id);
  };

  const handleCardClick = (e) => {
    // Don't navigate if clicking on checkbox or menu
    if (e.target.closest('input[type="checkbox"]') || e.target.closest('[role="menu"]') || e.target.closest('button')) {
      return;
    }
    onViewAnalytics?.(field.id);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`bg-surface-container-lowest rounded-lg overflow-hidden flex flex-col shadow-sm hover:shadow-xl transition-all duration-300 group cursor-pointer ${
        selected ? 'ring-2 ring-primary/30 shadow-lg' : 'ring-1 ring-outline/10'
      }`}
    >
      {/* Image Section */}
      <div className="relative h-48 overflow-hidden bg-surface-container-low">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 bg-gradient-to-br from-surface-container-low to-surface-container-highest animate-pulse flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant/30">landscape</span>
          </div>
        )}
        <img
          src={displayImage}
          alt={field.name}
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${!imageLoaded ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
        {/* Selection checkbox */}
        <label className="absolute top-4 left-4 w-9 h-9 bg-surface/90 backdrop-blur-md rounded-full flex items-center justify-center border border-outline/10 z-20" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-outline/30 accent-primary focus:ring-primary/30"
            checked={Boolean(selected)}
            onChange={(e) => onSelectChange?.(e.target.checked)}
            aria-label={`Select ${field.name}`}
          />
        </label>

        {/* Chips */}
        <div className="absolute top-4 left-16 right-16 flex flex-wrap gap-2 items-center">
          <span className="bg-surface/90 backdrop-blur-md text-primary-container text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter">
            {field.crop}
          </span>
          <span className={`${statusColorClass} backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 uppercase tracking-tighter`}>
            <span className="material-symbols-outlined text-xs">{statusIcon}</span>
            {field.status}
          </span>
        </div>
        <div className="absolute top-4 right-4" ref={menuRef}>
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="w-10 h-10 bg-surface/90 backdrop-blur-md rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Field actions"
            >
              <span className="material-symbols-outlined">more_vert</span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-44 bg-surface-container-highest rounded-lg shadow-xl border border-outline/10 overflow-hidden z-20"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleEditClick}
                  className="w-full px-4 py-3 text-sm font-semibold text-on-surface flex items-center gap-2 hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined text-base">edit</span>
                  Edit field
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDeleteClick}
                  disabled={isDeleting}
                  className="w-full px-4 py-3 text-sm font-semibold text-error flex items-center gap-2 hover:bg-surface-container-high transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-base">delete</span>
                  {isDeleting ? 'Deleting…' : 'Delete field'}
                </button>
              </div>
            )}
          </div>
        </div>
        {field.alert && (
          <div className="absolute bottom-4 right-4 w-3 h-3 bg-error rounded-full border-2 border-white shadow-lg"></div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-6">
        <h4 className="font-headline font-bold text-xl text-primary mb-1 truncate">{field.name}</h4>
        <p className="text-xs text-on-surface-variant font-medium mb-1">Area: {field.area} HA</p>
        <p className="text-xs text-on-surface-variant font-medium mb-4">NDVI Value: <span className="font-bold text-primary">{field.ndviValue}</span></p>

        {/* NDVI Trend */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-end mb-1">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              NDVI Trend
            </span>
            <span
              className={`text-xs font-bold ${
                field.trend === 'up'
                  ? 'text-primary'
                  : field.trend === 'down-critical'
                  ? 'text-error'
                  : field.trend === 'down'
                  ? 'text-secondary'
                  : 'text-on-surface-variant'
              }`}
            >
              {field.ndviTrend}
            </span>
          </div>

          {/* Sparkline */}
          <div className="h-10 flex items-end gap-1 px-1">
            {heights.map((height, idx) => {
              let barClass = '';
              if (field.trend === 'down-critical') {
                const opacityLevels = ['bg-error/10', 'bg-error/20', 'bg-error/30', 'bg-error/40', 'bg-error/60', 'bg-error/80'];
                barClass = opacityLevels[idx] || 'bg-error';
              } else if (field.trend === 'down') {
                const opacityLevels = ['bg-secondary/10', 'bg-secondary/20', 'bg-secondary/30', 'bg-secondary/40', 'bg-secondary/60', 'bg-secondary/80'];
                barClass = opacityLevels[idx] || 'bg-secondary';
              } else {
                const opacityLevels = ['bg-primary/10', 'bg-primary/20', 'bg-primary/30', 'bg-primary/40', 'bg-primary/60', 'bg-primary/80'];
                barClass = opacityLevels[idx] || 'bg-primary';
              }

              return (
                <div
                  key={idx}
                  style={{
                    height: `${height}%`,
                  }}
                  className={`w-full ${barClass} rounded-t-sm transition-all duration-300`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SavedFields;
