export const TEXT_SURFACES = [
    {
        id: 'paper',
        label: '云纸',
        background: '#fbf7ef',
        color: '#27231e',
    },
    {
        id: 'sepia',
        label: '麦笺',
        background: '#f1e3ce',
        color: '#31271e',
    },
    {
        id: 'mist',
        label: '青灰',
        background: '#edf1ee',
        color: '#222c2a',
    },
    {
        id: 'night',
        label: '墨夜',
        background: '#15171a',
        color: '#e6dfd2',
    },
];

export function getTextSurface(surfaceId) {
    return TEXT_SURFACES.find((item) => item.id === surfaceId) || TEXT_SURFACES[0];
}
