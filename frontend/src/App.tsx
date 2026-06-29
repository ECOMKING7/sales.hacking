import { Routes, Route, Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';

function Home() {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-semibold text-gray-800">Dashboard</h2>
      <p className="mt-2 text-gray-600">
        Welcome to the Attribution Platform.
      </p>
    </div>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center gap-2 border-b border-gray-200 bg-white px-8 py-4">
        <BarChart3 className="h-6 w-6 text-indigo-600" />
        <Link to="/" className="text-lg font-bold text-gray-900">
          Attribution Platform
        </Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
