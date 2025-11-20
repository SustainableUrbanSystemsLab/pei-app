// src/components/CityCompare.js
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, ZoomControl } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import MetricSliders from './MetricSliders'; // NEW
import 'leaflet/dist/leaflet.css';
import '../App.css';

const CityCompare = () => {
  // Current Options
  const years = ['2022', '2013'];

  // Component state
  const selectedCity = 'atlanta'; // Fixed to Atlanta
  const [yearBefore, setYearBefore] = useState('2013');
  const [yearAfter, setYearAfter] = useState('2022');
  const [metricWeights, setMetricWeights] = useState({
    IDI: 25,
    LDI: 25,
    PDI: 25,
    CDI: 25,
  });
  const [diffData, setDiffData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  // Calculate composite scores based on metric weights
  const calculateCompositeScores = (geoDataArray, metrics, weights) => {
    if (!geoDataArray || geoDataArray.length === 0) return null;
    
    const baseGeoData = geoDataArray[0];
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    
    if (totalWeight === 0) return null;
    
    const metricLookups = {};
    geoDataArray.forEach((geoData, index) => {
      const metric = metrics[index];
      metricLookups[metric] = {};
      geoData.features.forEach((feature) => {
        const geoid = feature.properties.GEOID;
        const rawValue = feature.properties[metric];
        const value = rawValue !== undefined && rawValue !== null 
          ? parseFloat(rawValue) 
          : 0;
        if (geoid) {
          metricLookups[metric][String(geoid)] = isNaN(value) ? 0 : value;
        }
      });
    });
    
    const compositeFeatures = baseGeoData.features.map((feature) => {
      const geoid = String(feature.properties.GEOID);
      let compositeScore = 0;
      
      metrics.forEach(metric => {
        const value = metricLookups[metric][geoid] || 0;
        const weight = weights[metric] || 0;
        compositeScore += (value * weight) / totalWeight;
      });
      
      return {
        ...feature,
        properties: {
          ...feature.properties,
          compositeScore: compositeScore
        }
      };
    });
    
    return {
      ...baseGeoData,
      features: compositeFeatures
    };
  };

  // Fetch multiple GeoJSONs and calculate composite scores for a given year
  const fetchGeoData = async (year) => {
    const metrics = ['IDI', 'LDI', 'PDI', 'CDI'];
    const baseUrl = 'https://vip-censusdata.s3.us-east-2.amazonaws.com';
    
    try {
      const promises = metrics.map(metric => 
        axios.get(`${baseUrl}/${selectedCity}_blockgroup_${metric}_${year}.geojson?t=${Date.now()}`)
      );
      
      const responses = await Promise.all(promises);
      const geoDataArray = responses.map(response => response.data);
      
      return calculateCompositeScores(geoDataArray, metrics, metricWeights);
    } catch (error) {
      console.error(`Error fetching data for year ${year}:`, error);
      return null;
    }
  };

  // Compute the percentage difference for each blockgroup based on composite scores
  const computeDiff = (beforeGeo, afterGeo) => {
    if (!beforeGeo || !afterGeo) return null;

    const beforeLookup = {};
    beforeGeo.features.forEach((feature) => {
      beforeLookup[feature.properties.GEOID] = feature;
    });

    const diffFeatures = afterGeo.features.map((feature) => {
      const id = feature.properties.GEOID;
      let percentDiff = 0;
      const beforeFeature = beforeLookup[id];
      if (beforeFeature) {
        const beforeVal = parseFloat(beforeFeature.properties.compositeScore);
        const afterVal = parseFloat(feature.properties.compositeScore);
        if (!isNaN(beforeVal) && !isNaN(afterVal)) {
          if (beforeVal === 0 && afterVal === 0) {
            percentDiff = 0;
          } else if (beforeVal !== 0) {
            percentDiff = Number((((afterVal - beforeVal) / beforeVal) * 100).toFixed(2));
          }
        }
      }
      feature.properties.percentDiff = percentDiff;
      return feature;
    });

    return { ...afterGeo, features: diffFeatures };
  };

  // Fetch both years’ data when any selection changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setRenderKey((prev) => prev + 1);
      const [dataBefore, dataAfter] = await Promise.all([
        fetchGeoData(yearBefore),
        fetchGeoData(yearAfter),
      ]);
      const diff = computeDiff(dataBefore, dataAfter);
      setDiffData(diff);
      setIsLoading(false);
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity, yearBefore, yearAfter, metricWeights]);

  // Helper to update the map view
  const MapSetView = ({ coordinates }) => {
    const map = useMap();
    useEffect(() => {
      if (map && coordinates) {
        map.setView(coordinates, map.getZoom());
        map.invalidateSize();
      }
    }, [map, coordinates]);
    return null;
  };

  // City coordinates
  const cityCoordinates = {
    atlanta: [33.749, -84.388],
    new_york: [40.7128, -74.006],
    los_angeles: [34.0522, -118.2437],
  };
  const coordinates = cityCoordinates[selectedCity] || [33.749, -84.388];

  // Color scale for % difference
  const getColor = (d) =>
    d > 50 ? '#006d2c' :
    d > 20 ? '#31a354' :
    d > 0  ? '#74c476' :
    d === 0 ? '#ffffcc' :
    d > -20 ? '#fc9272' :
    d > -50 ? '#de2d26' :
              '#a50f15';

  // GeoJSON styling
  const style = (feature) => ({
    fillColor: getColor(feature.properties.percentDiff),
    weight: 2,
    opacity: 1,
    color: 'white',
    dashArray: '3',
    fillOpacity: 0.7,
  });

  const onEachFeature = (feature, layer) => {
    const diffValue = feature.properties.percentDiff;
    const diffDisplay =
      diffValue !== null && diffValue !== undefined ? diffValue.toFixed(2) : 'N/A';

    layer.bindTooltip(
      `<div>
         <strong>Block Group ID:</strong> ${feature.properties.GEOID || 'N/A'}<br/>
         <strong>% Change:</strong> ${diffDisplay}%
       </div>`,
      { sticky: true }
    );

    layer.on({
      mouseover: (e) => {
        const lyr = e.target;
        lyr.setStyle({ weight: 5, color: '#666', dashArray: '', fillOpacity: 0.7 });
      },
      mouseout: (e) => {
        const lyr = e.target;
        lyr.setStyle(style(lyr.feature));
      },
    });
  };

  return (
    <div className="map-fullscreen">
      {isLoading ? (
        <p style={{ position: 'fixed', top: 70, left: 16, zIndex: 950 }}>Loading map data...</p>
      ) : diffData ? (
        <MapContainer
          key={renderKey}
          center={coordinates}
          zoom={12}
          zoomControl={false}
          style={{ height: '100vh', width: '100vw' }}
          crs={L.CRS.EPSG3857}
        >
          <ZoomControl position="bottomleft" />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
            noWrap={true}
          />
          <MapSetView coordinates={coordinates} />
          <GeoJSON data={diffData} style={style} onEachFeature={onEachFeature} />
        </MapContainer>
      ) : (
        <p style={{ position: 'fixed', top: 70, left: 16, zIndex: 950 }}>
          No data available for this selection.
        </p>
      )}

      {/* Right-side stacked panels: compare controls + sliders */}
      <div className="sidebar-stack" aria-label="Right sidebar panels">
        {/* Card 1: Compare controls */}
        <div className="sidebar-overlay" role="complementary" aria-label="Comparison controls">
          <div className="sidebar-section-title">Compare</div>
          <div className="city-display">
            <div className="city-name">Atlanta</div>
            <div className="city-subtitle">(more cities to come)</div>
          </div>
          <div className="year-selector">


            <div>
              <label htmlFor="yearBefore">Before Year</label>
              <select
                id="yearBefore"
                value={yearBefore}
                onChange={(e) => setYearBefore(e.target.value)}
              >
                {years.map((year, index) => (
                  <option key={index} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="yearAfter">After Year</label>
              <select
                id="yearAfter"
                value={yearAfter}
                onChange={(e) => setYearAfter(e.target.value)}
              >
                {years.map((year, index) => (
                  <option key={index} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Card 2: Sliders */}
        <MetricSliders 
          values={metricWeights}
          onChange={setMetricWeights}
        />
      </div>
    </div>
  );
};

export default CityCompare;
