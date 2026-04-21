import { Router, type IRouter } from "express";
import healthRouter from "./health";
import resumeRouter from "./resume";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(resumeRouter);
router.use(statsRouter);

export default router;
