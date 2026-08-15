#!/usr/bin/env python3
"""
Coverage API Service - Python
Valida cobertura usando geometría (Shapely)

Se ejecuta como proceso hijo desde Node.js
Recibe JSON en stdin, retorna JSON en stdout
"""

import sys
import json
import os
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

try:
    from shapely.geometry import Point, Polygon
    from shapely.ops import unary_union
except ImportError:
    # Si no está instalado, retornar error
    print(json.dumps({
        "error": "shapely no instalado. Instala con: pip install shapely"
    }))
    sys.exit(1)


# ════════════════════════════════════════════════════════════════════════════════
# PARSER KML/KMZ
# ════════════════════════════════════════════════════════════════════════════════

def parse_kml(kml_content):
    """Parse KML XML content y extrae polígonos"""
    zones = []

    try:
        root = ET.fromstring(kml_content)
        namespace = {'kml': 'http://www.opengis.net/kml/2.2'}

        # Buscar todos los Placemarks
        for placemark in root.findall('.//kml:Placemark', namespace):
            # Nombre de la zona
            name_elem = placemark.find('kml:name', namespace)
            name = name_elem.text if name_elem is not None else 'Sin nombre'

            # Buscar Polygon
            polygon_elem = placemark.find('.//kml:Polygon', namespace)
            if polygon_elem is None:
                continue

            # Extraer coordenadas exteriores
            outer_boundary = polygon_elem.find('.//kml:outerBoundaryIs', namespace)
            if outer_boundary is None:
                continue

            linear_ring = outer_boundary.find('kml:LinearRing', namespace)
            if linear_ring is None:
                continue

            coords_elem = linear_ring.find('kml:coordinates', namespace)
            if coords_elem is None or not coords_elem.text:
                continue

            # Parsear coordenadas (lon,lat,alt format)
            coords = []
            for coord_str in coords_elem.text.strip().split():
                if not coord_str.strip():
                    continue
                parts = coord_str.split(',')
                if len(parts) >= 2:
                    try:
                        lon = float(parts[0])
                        lat = float(parts[1])
                        coords.append((lon, lat))
                    except ValueError:
                        continue

            if len(coords) >= 3:  # Polígono válido
                try:
                    polygon = Polygon(coords)
                    if polygon.is_valid:
                        zones.append({
                            'name': name,
                            'polygon': polygon
                        })
                except Exception as e:
                    print(f"Error parsing polygon {name}: {e}", file=sys.stderr)
                    continue

    except Exception as e:
        raise ValueError(f"Error parsing KML: {str(e)}")

    return zones


def parse_kmz(kmz_path):
    """Parse KMZ (ZIP de KML) y extrae polígonos"""
    zones = []

    try:
        with ZipFile(kmz_path, 'r') as zip_file:
            # Buscar archivo KML
            kml_files = [f for f in zip_file.namelist() if f.lower().endswith('.kml')]

            for kml_file in kml_files:
                kml_content = zip_file.read(kml_file)
                zones.extend(parse_kml(kml_content))

    except Exception as e:
        raise ValueError(f"Error parsing KMZ: {str(e)}")

    return zones


# ════════════════════════════════════════════════════════════════════════════════
# OPERACIONES DE COVERAGE
# ════════════════════════════════════════════════════════════════════════════════

def load_coverage(file_path, file_name):
    """Carga archivo KML/KMZ y extrae zonas"""
    zones = []

    try:
        ext = Path(file_path).suffix.lower()

        if ext == '.kmz':
            zones = parse_kmz(file_path)
        elif ext == '.kml':
            with open(file_path, 'r', encoding='utf-8') as f:
                zones = parse_kml(f.read())
        else:
            raise ValueError("Formato no soportado")

        if not zones:
            raise ValueError("No se encontraron polígonos válidos")

        return {
            'status': 'ok',
            'zones': [{'name': z['name']} for z in zones],
            'zones_count': len(zones),
            'file_name': file_name
        }

    except Exception as e:
        raise ValueError(str(e))


def check_coverage(latitude, longitude, zones):
    """Valida si un punto tiene cobertura"""
    point = Point(longitude, latitude)

    for zone in zones:
        if zone['polygon'].contains(point):
            return {
                'latitude': latitude,
                'longitude': longitude,
                'has_coverage': True,
                'zone_name': zone['name']
            }

    return {
        'latitude': latitude,
        'longitude': longitude,
        'has_coverage': False,
        'zone_name': None
    }


def check_batch(points, zones):
    """Valida múltiples puntos"""
    results = []

    for point_data in points:
        result = check_coverage(
            point_data['latitude'],
            point_data['longitude'],
            zones
        )
        results.append(result)

    return {
        'results': results,
        'total': len(results)
    }


# ════════════════════════════════════════════════════════════════════════════════
# SERVICIO PRINCIPAL
# ════════════════════════════════════════════════════════════════════════════════

# Estado global del servicio
LOADED_ZONES = []


def main():
    global LOADED_ZONES

    try:
        # Leer input desde stdin
        input_str = sys.stdin.read()
        request = json.loads(input_str)

        operation = request.get('operation')
        params = request.get('params', {})
        data_dir = request.get('dataDir')

        # ────────────────────────────────────────────────────────────────────────
        if operation == 'load':
            file_path = params.get('filePath')
            file_name = params.get('fileName')

            zones = parse_kmz(file_path) if file_path.lower().endswith('.kmz') else parse_kml(
                open(file_path, 'r', encoding='utf-8').read()
            )

            LOADED_ZONES = zones

            response = {
                'status': 'ok',
                'zones': [{'name': z['name']} for z in zones],
                'zones_count': len(zones)
            }

        # ────────────────────────────────────────────────────────────────────────
        elif operation == 'check':
            if not LOADED_ZONES:
                raise ValueError('No hay zonas cargadas')

            latitude = params.get('latitude')
            longitude = params.get('longitude')

            response = check_coverage(latitude, longitude, LOADED_ZONES)

        # ────────────────────────────────────────────────────────────────────────
        elif operation == 'check_batch':
            if not LOADED_ZONES:
                raise ValueError('No hay zonas cargadas')

            points = params.get('points', [])
            response = check_batch(points, LOADED_ZONES)

        # ────────────────────────────────────────────────────────────────────────
        else:
            raise ValueError(f'Operación desconocida: {operation}')

        # Retornar respuesta
        print(json.dumps(response))
        sys.exit(0)

    except json.JSONDecodeError as e:
        print(json.dumps({
            'error': f'JSON parse error: {str(e)}'
        }))
        sys.exit(1)

    except ValueError as e:
        print(json.dumps({
            'error': str(e)
        }))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            'error': f'Unexpected error: {str(e)}'
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
