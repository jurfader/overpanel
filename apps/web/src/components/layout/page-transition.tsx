'use client'

import { motion } from 'framer-motion'
import { fadeIn } from '@/lib/animations'

interface PageTransitionProps {
  children: React.ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  return (
    <motion.div
      initial={fadeIn.initial}
      animate={fadeIn.animate}
      exit={fadeIn.exit}
      transition={fadeIn.transition}
    >
      {children}
    </motion.div>
  )
}
