"""Unit tests for procedural dungeon generation and pathfinding."""

import unittest
from crawler.dungeon import Dungeon, DungeonGenerator, TileType


class TestDungeon(unittest.TestCase):
    def test_generator_bounds_and_rooms(self):
        gen = DungeonGenerator(width=40, height=30, min_room_size=4, max_room_size=8, max_rooms=10)
        dungeon = gen.generate(seed=42)

        self.assertEqual(dungeon.width, 40)
        self.assertEqual(dungeon.height, 30)
        self.assertGreater(len(dungeon.rooms), 0)

        # Spawn must be walkable
        sx, sy = dungeon.player_spawn
        self.assertTrue(dungeon.is_walkable(sx, sy))
        self.assertEqual(dungeon.tiles[sy][sx], TileType.FLOOR)

        # Stairs must be walkable
        st_x, st_y = dungeon.stairs_pos
        self.assertTrue(dungeon.is_walkable(st_x, st_y))
        self.assertEqual(dungeon.tiles[st_y][st_x], TileType.STAIRS_DOWN)

    def test_all_rooms_connected(self):
        """Verify that every room center can be reached from player spawn."""
        gen = DungeonGenerator(width=50, height=35, max_rooms=12)
        dungeon = gen.generate(seed=12345)

        start = dungeon.player_spawn
        for i, room in enumerate(dungeon.rooms):
            path = dungeon.find_path(start, room.center)
            self.assertIsNotNone(
                path,
                f"Room {i} at {room.center} is not connected to player spawn {start}",
            )

        # Stairs must also be reachable
        stairs_path = dungeon.find_path(start, dungeon.stairs_pos)
        self.assertIsNotNone(stairs_path, "Stairs down are not reachable from spawn")

    def test_seed_reproducibility(self):
        gen = DungeonGenerator(width=35, height=25, max_rooms=8)
        d1 = gen.generate(seed=999)
        d2 = gen.generate(seed=999)

        self.assertEqual(d1.tiles, d2.tiles)
        self.assertEqual(d1.player_spawn, d2.player_spawn)
        self.assertEqual(d1.stairs_pos, d2.stairs_pos)

    def test_fov_computation(self):
        dungeon = Dungeon(width=20, height=20, seed=1)
        # Clear out a 5x5 room
        for y in range(5, 10):
            for x in range(5, 10):
                dungeon.tiles[y][x] = TileType.FLOOR

        fov = dungeon.compute_fov(px=7, py=7, radius=5)
        self.assertIn((7, 7), fov)
        self.assertIn((6, 6), fov)
        self.assertIn((8, 8), fov)
        # Wall tile just outside room should be in FOV (visible boundary)
        self.assertIn((5, 4), fov)

    def test_biomes_and_depth_scaling(self):
        d1 = Dungeon(20, 20)
        d1.depth = 1
        self.assertEqual(d1.biome, "crypt")

        d2 = Dungeon(20, 20)
        d2.depth = 2
        self.assertEqual(d2.biome, "cavern")

        d3 = Dungeon(20, 20)
        d3.depth = 3
        self.assertEqual(d3.biome, "inferno")

    def test_one_lost_soul_per_floor_in_a_walkable_spot(self):
        for seed in (42, 777, 12345):
            dungeon = DungeonGenerator(width=45, height=30).generate(seed=seed)
            with self.subTest(seed=seed):
                self.assertEqual(len(dungeon.souls), 1)
                sx, sy = dungeon.souls[0]
                self.assertEqual(dungeon.tiles[sy][sx], TileType.SOUL)
                self.assertTrue(dungeon.is_walkable(sx, sy))
                self.assertTrue(dungeon.is_transparent(sx, sy))
                self.assertNotEqual((sx, sy), dungeon.stairs_pos)
                self.assertNotEqual((sx, sy), dungeon.player_spawn)
                self.assertNotIn((sx, sy), dungeon.merchants)
                self.assertIn((sx, sy), [tuple(s) for s in dungeon.to_dict()["souls"]])

    def test_sigils_and_vault_form_a_floor_objective(self):
        for seed in (42, 777, 12345):
            dungeon = DungeonGenerator(width=45, height=30).generate(seed=seed)
            with self.subTest(seed=seed):
                self.assertGreaterEqual(len(dungeon.sigils), 3)
                for sx, sy in dungeon.sigils[:3]:
                    self.assertEqual(dungeon.tiles[sy][sx], TileType.SIGIL)
                    self.assertTrue(dungeon.is_walkable(sx, sy))
                    self.assertTrue(dungeon.is_transparent(sx, sy))
                self.assertIsNotNone(dungeon.vault)
                vx, vy = dungeon.vault
                self.assertEqual(dungeon.tiles[vy][vx], TileType.VAULT)
                self.assertTrue(dungeon.is_walkable(vx, vy))
                self.assertNotIn(dungeon.vault, dungeon.sigils)
                self.assertNotEqual(dungeon.vault, dungeon.stairs_pos)
                self.assertNotEqual(dungeon.vault, dungeon.player_spawn)
                data = dungeon.to_dict()
                self.assertEqual(len(data["sigils"]), len(dungeon.sigils))
                self.assertEqual(data["vault"], list(dungeon.vault))

    def test_one_pact_altar_per_floor_in_a_walkable_spot(self):
        for seed in (42, 777, 12345):
            dungeon = DungeonGenerator(width=45, height=30).generate(seed=seed)
            with self.subTest(seed=seed):
                self.assertEqual(len(dungeon.pacts), 1)
                ax, ay = dungeon.pacts[0]
                self.assertEqual(dungeon.tiles[ay][ax], TileType.PACT)
                self.assertTrue(dungeon.is_walkable(ax, ay))
                self.assertTrue(dungeon.is_transparent(ax, ay))
                self.assertNotIn((ax, ay), dungeon.sigils)
                self.assertNotIn((ax, ay), dungeon.souls)
                self.assertNotIn((ax, ay), dungeon.merchants)
                self.assertNotEqual((ax, ay), dungeon.player_spawn)
                self.assertNotEqual((ax, ay), dungeon.stairs_pos)
                self.assertIn([ax, ay], dungeon.to_dict()["pacts"])

    def test_pact_altar_still_spawns_on_a_degenerate_two_room_map(self):
        for seed in (20, 27, 54, 102, 118):
            dungeon = DungeonGenerator(width=20, height=20).generate(seed=seed)
            with self.subTest(seed=seed):
                self.assertEqual(len(dungeon.pacts), 1, "every floor must offer one altar")
                ax, ay = dungeon.pacts[0]
                self.assertEqual(dungeon.tiles[ay][ax], TileType.PACT)
                self.assertTrue(dungeon.is_walkable(ax, ay))
                self.assertNotEqual((ax, ay), dungeon.player_spawn)
                self.assertNotEqual((ax, ay), dungeon.stairs_pos)
                self.assertGreaterEqual(len(dungeon.sigils), 3)
                self.assertIsNotNone(dungeon.vault)

    def test_lost_soul_still_spawns_on_a_degenerate_two_room_map(self):
        for seed in (20, 27, 54, 102, 118):
            dungeon = DungeonGenerator(width=20, height=20).generate(seed=seed)
            with self.subTest(seed=seed):
                self.assertEqual(len(dungeon.souls), 1, "every floor must place one lost soul")
                sx, sy = dungeon.souls[0]
                self.assertEqual(dungeon.tiles[sy][sx], TileType.SOUL)
                self.assertNotEqual((sx, sy), dungeon.player_spawn)
                self.assertNotEqual((sx, sy), dungeon.stairs_pos)

    def test_merchant_spawns_on_depth_2(self):
        gen = DungeonGenerator(width=45, height=30, depth=2)
        dungeon = gen.generate(seed=777)
        self.assertGreater(len(dungeon.merchants), 0)
        mx, my = dungeon.merchants[0]
        self.assertEqual(dungeon.tiles[my][mx], TileType.MERCHANT)
        self.assertTrue(dungeon.is_walkable(mx, my))


if __name__ == "__main__":
    unittest.main()
