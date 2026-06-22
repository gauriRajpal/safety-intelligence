"""Knowledge Graph Layer (Neo4j).

Schema
------
Nodes:        (:Worker)(:Equipment)(:Permit)(:Sensor)(:Location)(:Incident)
Relationships:(:Worker)-[:WORKS_ON]->(:Equipment)
              (:Worker)-[:LOCATED_AT]->(:Location)
              (:Sensor)-[:CONNECTED_TO]->(:Equipment)
              (:Equipment)-[:PART_OF]->(:Location)
              (:Worker)-[:INVOLVED_IN]->(:Incident)
              (:Incident)-[:LOCATED_AT]->(:Location)

How the graph improves prediction
---------------------------------
Sensors give the *physical* state; the graph gives *context the sensors can't
see*: who is at the location right now, their experience level, and whether this
location has a history of incidents. `context_boost()` turns that into an additive
risk bump fed into the fusion layer — e.g. a low-experience crew at a location
with prior incidents raises the effective risk even at the same sensor values.

If Neo4j isn't running, every method degrades to a no-op (boost 0.0).
"""
from __future__ import annotations
import os
from typing import Dict, Optional

SCHEMA_CYPHER = [
    "CREATE CONSTRAINT worker_id IF NOT EXISTS FOR (w:Worker) REQUIRE w.id IS UNIQUE",
    "CREATE CONSTRAINT equip_id IF NOT EXISTS FOR (e:Equipment) REQUIRE e.id IS UNIQUE",
    "CREATE CONSTRAINT loc_id IF NOT EXISTS FOR (l:Location) REQUIRE l.id IS UNIQUE",
    "CREATE CONSTRAINT permit_id IF NOT EXISTS FOR (p:Permit) REQUIRE p.id IS UNIQUE",
]

# Returns workers present at a location, their min experience, and prior incident count
CONTEXT_QUERY = """
MATCH (l:Location {id: $loc})
OPTIONAL MATCH (w:Worker)-[:LOCATED_AT]->(l)
OPTIONAL MATCH (i:Incident)-[:LOCATED_AT]->(l)
OPTIONAL MATCH (p:Permit {active: true})-[:LOCATED_AT]->(l)
RETURN count(DISTINCT w) AS workers,
       coalesce(min(w.experience_years), 5.0) AS min_exp,
       count(DISTINCT i) AS prior_incidents,
       count(DISTINCT p) AS active_permits
"""


class GraphClient:
    def __init__(self):
        self.driver = None
        uri = os.getenv("NEO4J_URI")
        if uri:
            try:
                from neo4j import GraphDatabase
                self.driver = GraphDatabase.driver(
                    uri, auth=(os.getenv("NEO4J_USER", "neo4j"),
                               os.getenv("NEO4J_PASSWORD", "password")))
                self.ensure_schema()
            except Exception as e:  # pragma: no cover
                print("Neo4j unavailable:", e)
                self.driver = None

    def ensure_schema(self):
        if not self.driver:
            return
        with self.driver.session() as s:
            for q in SCHEMA_CYPHER:
                s.run(q)

    def context(self, location_id: str) -> Optional[Dict]:
        if not self.driver:
            return None
        try:
            with self.driver.session() as s:
                rec = s.run(CONTEXT_QUERY, loc=location_id).single()
                return dict(rec) if rec else None
        except Exception:  # pragma: no cover
            return None

    def context_boost(self, location_id: str) -> float:
        """Additive risk boost (0-15) from graph context."""
        ctx = self.context(location_id)
        if not ctx:
            return 0.0
        boost = 0.0
        if ctx.get("min_exp", 5) < 2:
            boost += 6          # inexperienced crew present
        boost += min(ctx.get("prior_incidents", 0) * 2.5, 7)  # incident history
        if ctx.get("workers", 0) > 0 and ctx.get("active_permits", 0) > 0:
            boost += 2          # people working under an active permit
        return round(min(boost, 15.0), 1)

    def close(self):
        if self.driver:
            self.driver.close()
