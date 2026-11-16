import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import ExtensionRegistration from './ExtensionRegistration.js';
import ContactSheetModal from './ContactSheetModal.js';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route index element={<ExtensionRegistration />} />
        <Route path="index.html" element={<ExtensionRegistration />} />
        <Route path="contact-sheet-modal" element={<ContactSheetModal />} />
      </Routes>
    </Router>
  );
}
