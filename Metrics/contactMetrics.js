import { SPEED_OF_LIGHT } from '../utils/constants.js';
import { checkLineOfSight, calculateDistance, clearVisibilityCache } from '../utils/raytracing.js';

class ContactMetrics {
    constructor() {
        this.activeContacts = new Map();
        this.contactHistory = [];
        this.lastUpdateTime = 0;
        this.timeOffset = 0;
    }

    // Définir le décalage de temps de référence
    setTimeOffset(offset) {
        this.timeOffset = offset;
        console.log(`Time offset set to ${offset.toFixed(2)}s`);
    }

    // Mettre à jour les contacts (appelé à chaque échantillonnage)
    update(satellites, currentTime) {
        const normalizedTime = currentTime - this.timeOffset;
        const newContacts = new Set();

        for (let i = 0; i < satellites.length; i++) {
            for (let j = i + 1; j < satellites.length; j++) {
                const sat1 = satellites[i];
                const sat2 = satellites[j];
                const contactKey = `${i}-${j}`;
                const isVisible = checkLineOfSight(sat1, sat2, currentTime);

                if (isVisible) {
                    newContacts.add(contactKey);

                    if (!this.activeContacts.has(contactKey)) {
                        const distance = calculateDistance(sat1, sat2);
                        this.activeContacts.set(contactKey, {
                            satA: i, satB: j,
                            startTime: normalizedTime,
                            distances: [distance],
                            latencies: [distance / SPEED_OF_LIGHT * 1000]
                        });
                    } else {
                        const contact = this.activeContacts.get(contactKey);
                        const distance = calculateDistance(sat1, sat2);
                        contact.distances.push(distance);
                        contact.latencies.push(distance / SPEED_OF_LIGHT * 1000);
                    }
                } else {
                    if (this.activeContacts.has(contactKey)) {
                        const contact = this.activeContacts.get(contactKey);
                        const duration = normalizedTime - contact.startTime;
                        const avgDistance = contact.distances.reduce((a, b) => a + b, 0) / contact.distances.length;
                        const avgLatency = contact.latencies.reduce((a, b) => a + b, 0) / contact.latencies.length;

                        this.contactHistory.push({
                            satA: contact.satA, satB: contact.satB,
                            startTime: contact.startTime,
                            endTime: normalizedTime,
                            duration, avgDistance, avgLatency
                        });

                        this.activeContacts.delete(contactKey);
                    }
                }
            }
        }

        this.lastUpdateTime = normalizedTime;
    }

    // Retourner les statistiques agrégées des contacts
    getStats() {
        const totalContacts = this.contactHistory.length + this.activeContacts.size;

        if (this.contactHistory.length === 0) {
            return { totalContacts, completedContacts: 0, activeContacts: this.activeContacts.size, avgDuration: 0, avgDistance: 0, avgLatency: 0 };
        }

        const avgDuration = this.contactHistory.reduce((sum, c) => sum + c.duration, 0) / this.contactHistory.length;
        const avgDistance = this.contactHistory.reduce((sum, c) => sum + c.avgDistance, 0) / this.contactHistory.length;
        const avgLatency = this.contactHistory.reduce((sum, c) => sum + c.avgLatency, 0) / this.contactHistory.length;

        return { totalContacts, completedContacts: this.contactHistory.length, activeContacts: this.activeContacts.size, avgDuration, avgDistance, avgLatency };
    }

    // Retourner l'historique complet des contacts
    getAllContacts() { return this.contactHistory; }

    // Réinitialiser toutes les métriques
    reset() {
        this.activeContacts.clear();
        this.contactHistory = [];
        this.lastUpdateTime = 0;
        this.timeOffset = 0;
        clearVisibilityCache();
    }
}

export default ContactMetrics;
