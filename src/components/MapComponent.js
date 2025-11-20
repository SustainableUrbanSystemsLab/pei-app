import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, ZoomControl, AttributionControl } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../App.css';

const MapComponent = ({ city, year, metricWeights }) => {
  const [geoData, setGeoData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [renderKey, setRenderKey] = useState(0); // Force re-render

  const cityCoordinates = {
    Atlanta: [33.7490, -84.3880],
    NYC: [40.7128, -74.0060],
    Boston: [42.3742, -71.0371],
  };

  const coordinates = cityCoordinates[city] || [33.7490, -84.3880];

  // Calculate composite scores based on metric weights
  const calculateCompositeScores = (geoDataArray, metrics, weights) => {
    if (!geoDataArray || geoDataArray.length === 0) return null;
    
    // Use the first GeoJSON as the base structure
    const baseGeoData = geoDataArray[0];
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    
    // If all weights are 0, return null
    if (totalWeight === 0) return null;
    
    // Create a lookup for each metric's data by GEOID
    const metricLookups = {};
    geoDataArray.forEach((geoData, index) => {
      const metric = metrics[index];
      metricLookups[metric] = {};
      geoData.features.forEach((feature) => {
        const geoid = feature.properties.GEOID;
        const value = parseFloat(feature.properties[metric]) || 0;
        metricLookups[metric][geoid] = value;
      });
    });
    
    // Calculate composite scores for each feature
    const compositeFeatures = baseGeoData.features.map((feature) => {
      const geoid = feature.properties.GEOID;
      let compositeScore = 0;
      
      // Calculate weighted average
      metrics.forEach(metric => {
        const value = metricLookups[metric][geoid] || 0;
        const weight = weights[metric] || 0;
        compositeScore += (value * weight) / totalWeight;
      });
      
      return {
        ...feature,
        properties: {
          ...feature.properties,
          compositeScore: compositeScore,
          // Keep individual metric values for tooltip
          ...metrics.reduce((acc, metric) => {
            acc[metric] = metricLookups[metric][geoid] || 0;
            return acc;
          }, {})
        }
      };
    });
    
    return {
      ...baseGeoData,
      features: compositeFeatures
    };
  };

  const fetchGeoData = useCallback(async () => {
    const metrics = ['IDI', 'LDI', 'PDI', 'CDI'];
    const baseUrl = 'https://vip-censusdata.s3.us-east-2.amazonaws.com';
    
    try {
      console.log(`Fetching multiple GeoJSONs for ${city} ${year}`);
      
      // Fetch all metric GeoJSONs in parallel (with cache-busting)
      const promises = metrics.map(metric => 
        axios.get(`${baseUrl}/${city}_blockgroup_${metric}_${year}.geojson?t=${Date.now()}`)
      );
      
      const responses = await Promise.all(promises);
      const geoDataArray = responses.map(response => response.data);
      
      // Calculate composite scores
      const compositeData = calculateCompositeScores(geoDataArray, metrics, metricWeights);
      setGeoData(compositeData);
      
    } catch (error) {
      console.error('Error fetching GeoJSONs:', error);
      setGeoData(null);
    } finally {
      setIsLoading(false);
    }
  }, [city, year, metricWeights]);
  

  useEffect(() => {
    setIsLoading(true);
    setRenderKey((prev) => prev + 1);
    fetchGeoData();
  }, [fetchGeoData]); // Trigger when fetchGeoData changes

  const MapSetView = ({ coordinates }) => {
    const map = useMap();

    useEffect(() => {
      if (map && coordinates) {
        map.setView(coordinates, map.getZoom()); // Retain the zoom level
        map.invalidateSize(); // Ensure layout updates
      }
    }, [map, coordinates]);

    return null;
  };

  const getColor = (value) =>
    value > 0.95 ? '#006400'  // Dark Green
    : value > 0.9 ? '#228B22'  // Forest Green
    : value > 0.85 ? '#32CD32' // Lime Green
    : value > 0.8 ? '#7FFF00'  // Chartreuse
    : value > 0.7 ? '#ADFF2F' // Green-Yellow
    : value > 0.6 ? '#FFFF66'  // Light Yellow
    : value > 0.5 ? '#FFFF00'  // Bright Yellow
    : value > 0.4 ? '#FFD700'  // Gold
    : value > 0.3 ? '#FFA500'  // Orange
    : value > 0.2 ? '#FF4500'  // Orange-Red
    : value > 0.1 ? '#B22222'  // Firebrick
    : '#8B0000';               // Dark Red


  const style = (feature) => ({
    fillColor: getColor(feature.properties.compositeScore || 0),
    weight: 2,
    opacity: 1,
    color: 'white',
    dashArray: '3',
    fillOpacity: 0.7,
  });

  const onEachFeature = (feature, layer) => {
    const compositeScore = feature.properties.compositeScore?.toFixed(2) || 'N/A';
    const individualScores = ['IDI', 'LDI', 'PDI', 'CDI'].map(metric => 
      `${metric}: ${(feature.properties[metric]?.toFixed(2)) || 'N/A'}`
    ).join('<br/>');
    
    layer.bindTooltip(
      `<div>
        <strong>Block Group ID:</strong> ${feature.properties.GEOID || 'N/A'}<br/>
        <strong>Composite Score:</strong> ${compositeScore}<br/>
        <strong>Individual Scores:</strong><br/>
        ${individualScores}
      </div>`,
      { sticky: true }
    );

    layer.on({
      mouseover: highlightFeature,
      mouseout: resetHighlight,
    });
  };

  const highlightFeature = (e) => {
    const layer = e.target;
    layer.setStyle({
      weight: 5,
      color: '#666',
      dashArray: '',
      fillOpacity: 0.7,
    });
  };

  const resetHighlight = (e) => {
    const layer = e.target;
    layer.setStyle(style(layer.feature));
  };

  return (
    <MapContainer
      key={renderKey}
      center={coordinates}
      zoom={12}
      zoomControl={false}
      attributionControl={false}
      style={{ height: '100vh', width: '100vw' }}
      crs={L.CRS.EPSG3857}
    >
      <AttributionControl position="bottomleft" />
      <ZoomControl position="bottomleft" />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        noWrap={true} // Prevents world wrapping
      />
      <MapSetView coordinates={coordinates} />
      {isLoading ? (
        <p>Loading map data...</p>
      ) : geoData ? (
        <GeoJSON
          key={`${city}-${year}-${JSON.stringify(metricWeights)}`}
          data={geoData}
          style={style}
          onEachFeature={onEachFeature}
        />
      ) : (
        <p>No data available for this selection.</p>
      )}
    </MapContainer>
  );
};

export default MapComponent;
