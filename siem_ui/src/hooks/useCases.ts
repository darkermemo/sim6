import { useState, useEffect } from 'react';
import type { 
  Case, 
  CaseWithEvidence, 
  CreateCaseRequest, 
  CreateCaseResponse, 
  UpdateCaseRequest 
} from '../types/api';

interface UseCasesResult {
  cases: Case[];
  loading: boolean;
  error: string | null;
  createCase: (caseData: CreateCaseRequest) => Promise<CreateCaseResponse | null>;
  refetch: () => Promise<void>;
}

interface UseCaseDetailResult {
  caseDetail: CaseWithEvidence | null;
  loading: boolean;
  error: string | null;
  updateCase: (updates: UpdateCaseRequest) => Promise<boolean>;
  refetch: () => Promise<void>;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
};

export const useCases = (): UseCasesResult => {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCases = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/v1/cases', {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch cases');
      }

      const data = await response.json();
      // Ensure data is always an array to prevent filter errors
      setCases(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cases');
    } finally {
      setLoading(false);
    }
  };

  const createCase = async (caseData: CreateCaseRequest): Promise<CreateCaseResponse | null> => {
    try {
      setError(null);
      
      const response = await fetch('/api/v1/cases', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(caseData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create case');
      }

      const result: CreateCaseResponse = await response.json();
      await fetchCases(); // Refresh cases list
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case');
      return null;
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  return {
    cases,
    loading,
    error,
    createCase,
    refetch: fetchCases,
  };
};

export const useCaseDetail = (caseId: string): UseCaseDetailResult => {
  const [caseDetail, setCaseDetail] = useState<CaseWithEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCaseDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/v1/cases/${caseId}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch case details');
      }

      const data: CaseWithEvidence = await response.json();
      setCaseDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch case details');
    } finally {
      setLoading(false);
    }
  };

  const updateCase = async (updates: UpdateCaseRequest): Promise<boolean> => {
    try {
      const response = await fetch(`/api/v1/cases/${caseId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update case');
      }

      await fetchCaseDetail(); // Refresh case data
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update case');
      return false;
    }
  };

  useEffect(() => {
    if (caseId) {
      fetchCaseDetail();
    }
  }, [caseId]);

  return {
    caseDetail,
    loading,
    error,
    updateCase,
    refetch: fetchCaseDetail,
  };
};