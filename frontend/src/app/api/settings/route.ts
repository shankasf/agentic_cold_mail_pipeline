import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/settings - Get admin settings
export async function GET() {
  try {
    let settings = await prisma.adminSettings.findFirst();

    if (!settings) {
      // Create default settings
      settings = await prisma.adminSettings.create({
        data: {},
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// POST /api/settings - Update admin settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Input validation
    if (body.confidenceThreshold !== undefined) {
      const threshold = Number(body.confidenceThreshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        return NextResponse.json({ error: 'Confidence threshold must be between 0 and 100' }, { status: 400 });
      }
    }

    if (body.deliverabilityThreshold !== undefined) {
      const threshold = Number(body.deliverabilityThreshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        return NextResponse.json({ error: 'Deliverability threshold must be between 0 and 100' }, { status: 400 });
      }
    }

    if (body.maxWords !== undefined) {
      const maxWords = Number(body.maxWords);
      if (isNaN(maxWords) || maxWords < 1 || maxWords > 10000) {
        return NextResponse.json({ error: 'Max words must be between 1 and 10000' }, { status: 400 });
      }
    }

    if (body.sendingCapPerDay !== undefined) {
      const cap = Number(body.sendingCapPerDay);
      if (isNaN(cap) || cap < 0 || cap > 100000) {
        return NextResponse.json({ error: 'Sending cap must be between 0 and 100000' }, { status: 400 });
      }
    }

    if (body.calendlyUrl !== undefined && body.calendlyUrl !== null && body.calendlyUrl !== '') {
      try {
        new URL(body.calendlyUrl);
      } catch {
        return NextResponse.json({ error: 'Calendly URL must be a valid URL' }, { status: 400 });
      }
    }

    // Build update data with validated values
    const updateData: {
      businessAddress?: string;
      calendlyUrl?: string;
      confidenceThreshold?: number;
      deliverabilityThreshold?: number;
      maxWords?: number;
      sendingCapPerDay?: number;
    } = {};

    if (body.businessAddress !== undefined) updateData.businessAddress = String(body.businessAddress);
    if (body.calendlyUrl !== undefined) updateData.calendlyUrl = body.calendlyUrl || null;
    if (body.confidenceThreshold !== undefined) updateData.confidenceThreshold = Number(body.confidenceThreshold);
    if (body.deliverabilityThreshold !== undefined) updateData.deliverabilityThreshold = Number(body.deliverabilityThreshold);
    if (body.maxWords !== undefined) updateData.maxWords = Number(body.maxWords);
    if (body.sendingCapPerDay !== undefined) updateData.sendingCapPerDay = Number(body.sendingCapPerDay);

    let settings = await prisma.adminSettings.findFirst();

    if (settings) {
      settings = await prisma.adminSettings.update({
        where: { id: settings.id },
        data: updateData,
      });
    } else {
      settings = await prisma.adminSettings.create({
        data: updateData,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
