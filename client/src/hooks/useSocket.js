import { useEffect, useState, useCallback } from 'react';
import { getSocket, connectSocket } from '../services/socket';

/**
 * Custom hook to subscribe to Socket.IO events with automatic cleanup.
 *
 * Listens to:
 * - 'care:due': Periodic care reminders (vaccination, deworming, farrier)
 * - 'fitness:alert': Abnormal vital signs / overexertion alerts
 * - 'sensor:reading': Live sensor stream
 */
export function useSocket(onCareDue, onFitnessAlert, onSensorReading) {
  const [isConnected, setIsConnected] = useState(false);
  const [alerts, setAlerts] = useState([]);

  const addAlert = useCallback((newAlert) => {
    setAlerts((prev) => [newAlert, ...prev.slice(0, 19)]); // keep last 20
  }, []);

  const clearAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return undefined;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    const handleCareDue = (payload) => {
      const alertObj = {
        id: payload.notification?._id || `care-${Date.now()}-${Math.random()}`,
        type: 'care_due',
        severity: 'warning',
        title: 'Lịch Y tế đến hạn',
        message: payload.notification?.message || `Ngựa có lịch y tế (${payload.item}) đến hạn.`,
        horseId: payload.horseId,
        timestamp: new Date(),
        raw: payload,
      };
      addAlert(alertObj);
      if (onCareDue) onCareDue(payload);
    };

    const handleFitnessAlert = (payload) => {
      const alertObj = {
        id: payload.notification?._id || `fitness-${Date.now()}-${Math.random()}`,
        type: 'fitness_alert',
        severity: 'danger',
        title: 'Cảnh báo Sức khỏe / Thể lực Bất thường',
        message: payload.notification?.message || `Phát hiện nhịp tim (${payload.heartRate} bpm) hoặc tốc độ (${payload.speed} km/h) bất thường.`,
        horseId: payload.horseId,
        heartRate: payload.heartRate,
        speed: payload.speed,
        timestamp: new Date(),
        raw: payload,
      };
      addAlert(alertObj);
      if (onFitnessAlert) onFitnessAlert(payload);
    };

    const handleSensor = (payload) => {
      if (onSensorReading) onSensorReading(payload);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('care:due', handleCareDue);
    socket.on('fitness:alert', handleFitnessAlert);
    socket.on('sensor:reading', handleSensor);

    if (socket.connected) {
      setIsConnected(true);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('care:due', handleCareDue);
      socket.off('fitness:alert', handleFitnessAlert);
      socket.off('sensor:reading', handleSensor);
    };
  }, [onCareDue, onFitnessAlert, onSensorReading, addAlert]);

  return {
    isConnected,
    alerts,
    clearAlert,
    clearAllAlerts,
  };
}

export default useSocket;
