import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';
import {
  getMarketServers,
  getMarketServerByName,
  getMarketCategories,
  getMarketTags,
  searchMarketServers,
  filterMarketServersByCategory,
  filterMarketServersByTag,
  registerCustomServer,
  updateCustomServer,
  deleteCustomServer,
} from '../services/marketService.js';

// Get all market servers
export const getAllMarketServers = (_: Request, res: Response): void => {
  try {
    const marketServers = Object.values(getMarketServers());
    const response: ApiResponse = {
      success: true,
      data: marketServers,
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get market servers information',
    });
  }
};

// Get a specific market server by name
export const getMarketServer = (req: Request, res: Response): void => {
  try {
    const { name } = req.params;
    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Server name is required',
      });
      return;
    }

    const server = getMarketServerByName(name);
    if (!server) {
      res.status(404).json({
        success: false,
        message: 'Market server not found',
      });
      return;
    }

    const response: ApiResponse = {
      success: true,
      data: server,
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get market server information',
    });
  }
};

// Get all market categories
export const getAllMarketCategories = (_: Request, res: Response): void => {
  try {
    const categories = getMarketCategories();
    const response: ApiResponse = {
      success: true,
      data: categories,
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get market categories',
    });
  }
};

// Get all market tags
export const getAllMarketTags = (_: Request, res: Response): void => {
  try {
    const tags = getMarketTags();
    const response: ApiResponse = {
      success: true,
      data: tags,
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get market tags',
    });
  }
};

// Search market servers
export const searchMarketServersByQuery = (req: Request, res: Response): void => {
  try {
    const { query } = req.query;
    const searchQuery = typeof query === 'string' ? query : '';

    const servers = searchMarketServers(searchQuery);
    const response: ApiResponse = {
      success: true,
      data: servers,
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to search market servers',
    });
  }
};

// Filter market servers by category
export const getMarketServersByCategory = (req: Request, res: Response): void => {
  try {
    const { category } = req.params;

    const servers = filterMarketServersByCategory(category);
    const response: ApiResponse = {
      success: true,
      data: servers,
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to filter market servers by category',
    });
  }
};

// Filter market servers by tag
export const getMarketServersByTag = (req: Request, res: Response): void => {
  try {
    const { tag } = req.params;

    const servers = filterMarketServersByTag(tag);
    const response: ApiResponse = {
      success: true,
      data: servers,
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to filter market servers by tag',
    });
  }
};

// Register a custom MCP server from a Git repository
export const registerCustomMarketServer = (req: Request, res: Response): void => {
  try {
    const { serverName, repositoryUrl, tags, version } = req.body;

    if (!serverName || !repositoryUrl) {
      res.status(400).json({
        success: false,
        message: 'serverName and repositoryUrl are required',
      });
      return;
    }

    // Validate URL format
    try {
      new URL(repositoryUrl);
    } catch {
      res.status(400).json({
        success: false,
        message: 'Invalid repository URL format',
      });
      return;
    }

    const parsedTags = Array.isArray(tags)
      ? tags.filter((tag: unknown): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : [];

    const newServer = registerCustomServer(serverName, repositoryUrl, parsedTags, version);
    const response: ApiResponse = {
      success: true,
      data: newServer,
      message: 'Custom server registered successfully',
    };
    res.status(201).json(response);
  } catch (error) {
    console.error('Failed to register custom server:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register custom server',
    });
  }
};

// Update a custom MCP server
export const updateCustomMarketServer = (req: Request, res: Response): void => {
  try {
    const { serverName } = req.params;
    const { repositoryUrl, displayName, newServerName, tags, version } = req.body;

    if (!serverName) {
      res.status(400).json({
        success: false,
        message: 'serverName is required',
      });
      return;
    }

    if (!repositoryUrl && !displayName && !newServerName && !tags && typeof version === 'undefined') {
      res.status(400).json({
        success: false,
        message: 'At least one of repositoryUrl, displayName, newServerName, tags, or version must be provided',
      });
      return;
    }

    // Validate URL format if provided
    if (repositoryUrl) {
      try {
        new URL(repositoryUrl);
      } catch {
        res.status(400).json({
          success: false,
          message: 'Invalid repository URL format',
        });
        return;
      }
    }

    const parsedTags = Array.isArray(tags)
      ? tags.filter((tag: unknown): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : undefined;

    const updatedServer = updateCustomServer(serverName, {
      repositoryUrl,
      displayName,
      newServerName,
      tags: parsedTags,
      version,
    });
    const response: ApiResponse = {
      success: true,
      data: updatedServer,
      message: 'Custom server updated successfully',
    };
    res.json(response);
  } catch (error) {
    console.error('Failed to update custom server:', error);
    const message = error instanceof Error ? error.message : 'Failed to update custom server';
    res.status(error instanceof Error && message.includes('not found') ? 404 : 500).json({
      success: false,
      message,
    });
  }
};

// Delete a custom MCP server
export const deleteCustomMarketServer = (req: Request, res: Response): void => {
  try {
    const { serverName } = req.params;

    if (!serverName) {
      res.status(400).json({
        success: false,
        message: 'serverName is required',
      });
      return;
    }

    deleteCustomServer(serverName);
    const response: ApiResponse = {
      success: true,
      message: 'Custom server deleted successfully',
    };
    res.json(response);
  } catch (error) {
    console.error('Failed to delete custom server:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete custom server';
    res.status(error instanceof Error && message.includes('not found') ? 404 : 500).json({
      success: false,
      message,
    });
  }
};

