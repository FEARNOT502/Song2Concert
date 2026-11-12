"""Regressions for the Dome's row curves and deliberate pole crease.

Run: python -m unittest test_td_geometry.py (from pipeline/).
"""
import unittest
import numpy as np
from shapely.geometry import Polygon, Point
from standlib import Grid
from td_stand1 import Finger
from td_geometry import row_strip
from td_lay2f import row_curves
from td_seatfit import ordered_fit, pillar_clear, chair_rectangles
import td_chart


class DomeGeometryTest(unittest.TestCase):
    def test_continuous_sampling_does_not_turn_a_circle_into_grid_steps(self):
        g = Grid(-100, 100, -100, 100, 0.1)
        z, x = np.mgrid[0:g.H, 0:g.W]
        x, z = g.m(x, z)
        field = (np.hypot(x, z) - 50).astype(np.float32)
        curves = row_curves(field, None, g, (0, 0), [2.0, 3.0], th_lo=-30, th_hi=30, dth=0.2)
        radii = []
        for dc, (th, x, z, s, good) in curves.items():
            self.assertTrue(good.all())
            r = np.hypot(x, z)
            self.assertLess(np.max(np.abs(r - 50 - dc)), 0.002)
            self.assertLess(np.max(np.abs(np.diff(r, n=2))), 0.0002)
            self.assertTrue(np.all(np.diff(s) > 0))
            radii.append(r)
        self.assertLess(np.max(np.abs((radii[1]-radii[0])-1)), 0.002)

    def test_pole_crease_is_retained_without_a_gap_or_chord_across_it(self):
        shape = Polygon([[-5, -5], [5, -5], [5, 10], [-5, 10]])
        f = Finger(2, 2, (0, 1), 3, shape, None)
        f.kinkR = (np.array([0., -10.]), np.array([0., 10.]), -1., np.array([-0.4, 1.]), 0.)
        row = row_strip(f, 2, 3, shape, overlap=0)
        self.assertTrue(row.is_valid)
        self.assertEqual(row.geom_type, 'Polygon')
        t = np.linspace(-4.9, 4.9, 501)
        p = f.row_point(t, 2.5)
        self.assertLess(np.max(np.abs(f.coord(p)-2.5)), 1e-9)
        self.assertTrue(all(row.covers(Point(*q)) for q in p))
        # One side stays horizontal; the other turns at x=0, not gradually.
        self.assertAlmostEqual(f.row_point(-4, 2.5)[0, 1], 4.1)
        self.assertAlmostEqual(f.row_point(4, 2.5)[0, 1], 2.5)
        self.assertTrue(any(abs(x) < 1e-8 and abs(y-2) < 1e-8 for x, y in row.exterior.coords))

    def test_review_crease_uses_each_blocks_inner_frame(self):
        q0=np.array([72.23,-69.79]);q1=np.array([98.02,-58.20]);d=q1-q0
        outer=np.array([np.sin(np.deg2rad(-54)),np.cos(np.deg2rad(-54))])
        for angle in (-80,-88):
            inner=np.array([np.sin(np.deg2rad(angle)),np.cos(np.deg2rad(angle))])
            gradient=outer*(d@inner)/(d@outer);offset=q0@inner-q0@gradient
            p=q0+np.linspace(-1,2,100)[:,None]*d
            self.assertLess(np.max(abs(p@inner-(p@gradient+offset))),1e-10)
            self.assertAlmostEqual(abs(gradient[0]*outer[1]-gradient[1]*outer[0]),0,places=10)
            self.assertGreater(np.linalg.norm(gradient),1)

    def test_pdf_gaps_and_single_seat_rows_are_not_interpolated(self):
        rows = td_chart.load()['A01']['rows']
        self.assertNotIn('22', rows)
        self.assertEqual(rows['18'], [[481, 484]])
        self.assertEqual(rows['20'], [[481, 481]])

    def test_complete_row_fits_around_an_opening_without_clipped_end_seats(self):
        available=np.r_[np.arange(0,2,.02),np.arange(3,6.01,.02)]
        target=np.linspace(.3,5.7,10)
        chosen=ordered_fit(available,target)
        self.assertIsNotNone(chosen)
        self.assertEqual(len(chosen),10)
        self.assertGreaterEqual(np.diff(chosen).min(),.44-1e-8)
        self.assertFalse(np.any((chosen>=2)&(chosen<3)))
        self.assertIsNone(ordered_fit(np.arange(0,2,.02),np.linspace(0,2,10)))

    def test_folded_chair_clearance_uses_width_and_depth_separately(self):
        import shapely
        chairs=chair_rectangles(np.array([[0.,0.],[0.,.3],[.3,0.]]),np.zeros(3))
        self.assertFalse(shapely.intersects(chairs[0],chairs[1]))
        self.assertTrue(shapely.intersects(chairs[0],chairs[2]))

    def test_pillar_checks_the_chair_body_and_offset_shaft_at_its_height(self):
        shaft={'x':0,'z':0,'r':.4,'ax':0,'az':1,'y0':9.5,'y1':20,
               'sections':[{'rx':.3,'rz':.4,'offsetAlong':.3,'y0':9.5,'y1':20}]}
        points=np.array([[0,.3],[0,.3],[0,-.6]])
        clear=pillar_clear(points,np.array([8.9,8.,8.9]),[shaft],np.zeros(3))
        self.assertEqual(clear.tolist(),[False,True,True])


if __name__ == '__main__':
    unittest.main()
