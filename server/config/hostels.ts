export interface HostelBoundary {
    points: Array<{ latitude: number; longitude: number }>;
    center?: { latitude: number; longitude: number };
    radius?: number; // in meters
}

// Valluvar Mens Hostel coordinates (updated location)
const VALLUVAR_CONFIG = {
    points: [
        { latitude: 11.273458896122523, longitude: 77.60649425525024 },
        { latitude: 11.27341680881379, longitude: 77.60733915107322 },
        { latitude: 11.273764028926491, longitude: 77.60702801483365 },
        { latitude: 11.27316691529131, longitude: 77.60702265041573 },
        { latitude: 11.273461526579116, longitude: 77.60701460378884 },
    ],
    center: { latitude: 11.273453635146646, longitude: 77.60697973507233 },
    radius: 1000, // 1000 meters radius for geofencing
};

export const HOSTEL_LOCATIONS: Record<string, HostelBoundary> = {
    "Kaveri Ladies Hostel": { ...VALLUVAR_CONFIG },
    "Amaravathi Ladies Hostel": { ...VALLUVAR_CONFIG },
    "Bhavani Ladies Hostel": { ...VALLUVAR_CONFIG },
    "Dheeran Mens Hostel": { ...VALLUVAR_CONFIG },
    "Valluvar Mens Hostel": { ...VALLUVAR_CONFIG },
    "Ilango Mens Hostel": { ...VALLUVAR_CONFIG },
    "Bharathi Mens Hostel": { ...VALLUVAR_CONFIG },
    "Kamban Mens Hostel": { ...VALLUVAR_CONFIG },
    "Ponnar Mens Hostel": { ...VALLUVAR_CONFIG },
    "Sankar Mens Hostel": { ...VALLUVAR_CONFIG },
    "TEST - My Location": { ...VALLUVAR_CONFIG },
};
