"""Seed a small demo knowledge graph so /graph/context returns something.

    python -m scripts.seed_graph
Requires NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD env vars and a running Neo4j.
"""
from __future__ import annotations
import os
from neo4j import GraphDatabase

SEED = """
MERGE (l:Location {id:'tank-b', name:'Tank B'})
MERGE (e:Equipment {id:'valve-v1', name:'Valve V-1'})-[:PART_OF]->(l)
MERGE (s:Sensor {id:'ch4-01', kind:'methane'})-[:CONNECTED_TO]->(e)
MERGE (w1:Worker {id:'w-101', name:'A. Rao', experience_years:1.0})-[:LOCATED_AT]->(l)
MERGE (w1)-[:WORKS_ON]->(e)
MERGE (w2:Worker {id:'w-102', name:'J. Okafor', experience_years:8.0})-[:LOCATED_AT]->(l)
MERGE (p:Permit {id:'HW-1183', kind:'hot_work', active:true})-[:LOCATED_AT]->(l)
MERGE (i:Incident {id:'inc-2023-04', kind:'flash_fire'})-[:LOCATED_AT]->(l)
MERGE (w1)-[:INVOLVED_IN]->(i)
"""


def main():
    uri = os.environ["NEO4J_URI"]
    drv = GraphDatabase.driver(uri, auth=(os.getenv("NEO4J_USER", "neo4j"),
                                          os.getenv("NEO4J_PASSWORD", "password")))
    with drv.session() as s:
        s.run(SEED)
    drv.close()
    print("seeded demo graph (location 'tank-b' now has an inexperienced worker + prior incident)")


if __name__ == "__main__":
    main()
