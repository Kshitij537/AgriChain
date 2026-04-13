import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const Profile = () => {
  const [profile, setProfile] = useState({
    name: 'John Smith',
    email: 'john@farm.com',
    phone: '+1 (555) 123-4567',
    organization: 'Valley Farms Co.',
    location: 'Iowa, USA',
    bio: 'Organic farming enthusiast with 15 years of experience'
  });

  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-primary font-headline mb-4">User Profile</h1>
          </div>

          <div className="glass-card rounded-xl p-8 shadow-sm border border-emerald-900/5 mb-8">
            <div className="flex items-start justify-between mb-8">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <span className="material-symbols-outlined text-6xl text-white">account_circle</span>
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-primary font-headline mb-1">{profile.name}</h2>
                  <p className="text-on-surface-variant">{profile.organization}</p>
                  <p className="text-sm text-on-surface-variant">{profile.location}</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="px-6 py-2 bg-primary text-white rounded-lg font-bold hover:opacity-90 transition-all"
              >
                {isEditing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase mb-1">Email</p>
                {isEditing ? (
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({...profile, email: e.target.value})}
                    className="w-full px-4 py-2 border border-outline rounded-lg"
                  />
                ) : (
                  <p className="font-medium text-primary">{profile.email}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase mb-1">Phone</p>
                {isEditing ? (
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({...profile, phone: e.target.value})}
                    className="w-full px-4 py-2 border border-outline rounded-lg"
                  />
                ) : (
                  <p className="font-medium text-primary">{profile.phone}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase mb-1">Organization</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.organization}
                    onChange={(e) => setProfile({...profile, organization: e.target.value})}
                    className="w-full px-4 py-2 border border-outline rounded-lg"
                  />
                ) : (
                  <p className="font-medium text-primary">{profile.organization}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase mb-1">Location</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.location}
                    onChange={(e) => setProfile({...profile, location: e.target.value})}
                    className="w-full px-4 py-2 border border-outline rounded-lg"
                  />
                ) : (
                  <p className="font-medium text-primary">{profile.location}</p>
                )}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-bold text-on-surface-variant uppercase mb-2">Bio</p>
              {isEditing ? (
                <textarea
                  value={profile.bio}
                  onChange={(e) => setProfile({...profile, bio: e.target.value})}
                  className="w-full px-4 py-2 border border-outline rounded-lg"
                  rows={4}
                />
              ) : (
                <p className="font-medium text-primary">{profile.bio}</p>
              )}
            </div>

            {isEditing && (
              <div className="flex gap-4 mt-8">
                <button className="flex-1 gradient-primary text-white py-3 rounded-lg font-bold hover:opacity-90">
                  Save Changes
                </button>
              </div>
            )}
          </div>

          {/* Subscription Section */}
          <div className="glass-card rounded-xl p-8 shadow-sm border border-emerald-900/5">
            <h2 className="text-2xl font-bold text-primary mb-6 font-headline">Subscription</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase mb-2">Current Plan</p>
                <p className="text-2xl font-bold text-primary font-headline">Premium</p>
                <p className="text-sm text-on-surface-variant mt-2">$99/month</p>
              </div>
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase mb-2">Renews On</p>
                <p className="text-2xl font-bold text-primary font-headline">May 15, 2024</p>
              </div>
            </div>
            <button className="w-full mt-6 bg-surface-container-highest text-primary py-3 rounded-lg font-bold hover:opacity-90">
              Manage Subscription
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Profile;
